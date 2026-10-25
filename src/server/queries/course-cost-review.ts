import 'server-only';
import {coursePrisma} from '@/lib/course-db';
import {requireCourseStore} from '@/lib/industry-module-server';
import {monthRange,toLocalDateStr} from '@/lib/date-utils';
import {settlementMonth} from '@/lib/course-monthly-settlement';
import {courseChargeSettings,courseChargeSnapshot} from '@/lib/course-charge-settings';
import {courseFeeCostVersion,purchaseCostReview,coursePurchaseCostSnapshot} from '@/lib/course-cost-review';
import {musicPlanWhere} from '@/server/services/music-plan-scope';
import {musicPurchaseWhere,musicTrialBookingWhere} from '@/server/services/music-finance-scope';
import {musicDataScope} from '@/server/services/music-data-scope';
import {readMusicTuition} from '@/server/services/music-tuition';
import {readCourseMonthlySettlement} from '@/server/services/course-monthly-settlement';
import {AppError} from '@/lib/errors';
/** Caller authorizes whole-store report/cost access; salary reads are a separate grant. */
export async function getCourseCostReview(storeId:string,month:string,access:{fees:boolean},dataScope?:string){
 settlementMonth.parse(month);await requireCourseStore(storeId);
 const {start,end}=monthRange(month);
 return coursePrisma.$transaction(async tx=>{
  const [plans,orders,trials,payroll]=await Promise.all([
   tx.coursePointPlan.findMany({where:{storeId,...musicPlanWhere(storeId,dataScope)},orderBy:[{isActive:'desc'},{name:'asc'}],take:501}),
   tx.coursePurchase.findMany({where:{storeId,...musicPurchaseWhere(storeId,dataScope),confirmedAt:{gte:start,lte:end},status:{in:['CONFIRMED','REFUNDED','VOIDED']}},include:{refunds:{where:{storeId}}},orderBy:[{confirmedAt:'desc'},{id:'asc'}],take:1001}),
   tx.courseTrialPayment.findMany({where:{storeId,booking:musicTrialBookingWhere(storeId,dataScope),OR:[{createdAt:{gte:start,lte:end}},{voidedAt:{gte:start,lte:end}}]},include:{booking:{select:{session:{select:{nameSnapshot:true,chargeSnapshot:true}}}}},orderBy:[{createdAt:'desc'},{id:'asc'}],take:1001}),
   access.fees?readCourseMonthlySettlement(tx,storeId,month):null,
  ]);
  if(plans.length>500||orders.length>1000||trials.length>1000)throw new AppError('VALIDATION','本月核對資料過多，請聯絡管理者分批核對，尚未顯示部分金額合計。');
  const ids=[...plans.map(p=>p.id),...orders.flatMap(o=>[o.id,...(o.planId?[o.planId]:[])]),...trials.map(t=>t.bookingId)];
  const [audits,tuition]=await Promise.all([
   ids.length?tx.$queryRaw<Array<{id:string;targetType:string;targetId:string;afterJson:unknown;createdAt:Date}>>`SELECT id,"targetType","targetId","afterJson","createdAt" FROM "AuditLog" WHERE "storeId"=${storeId} AND "targetId"=ANY(${[...new Set(ids)]}::text[]) AND (("targetType"='CoursePointPlan' AND action='CONFIRM_COSTS') OR ("targetType"='CoursePurchase' AND action='COURSE_COST_QUOTE') OR ("targetType"='CourseBooking' AND action IN('COLLECT_TRIAL_PAYMENT','CORRECT_TRIAL_PAYMENT'))) ORDER BY "createdAt" DESC,id DESC`:[],
   readMusicTuition(tx,storeId,orders.map(o=>o.id)),
  ]);
  const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
  const catalog=plans.map(plan=>{
   const version=courseFeeCostVersion(plan),settings=courseChargeSettings.safeParse(plan.chargeSettings);
   const confirmed=audits.find(a=>a.targetType==='CoursePointPlan'&&a.targetId===plan.id&&object(a.afterJson)?.version===version);
   const trial= settings.success&&settings.data.kind==='single'&&settings.data.trialPrice!==null?{price:settings.data.trialPrice,cost:settings.data.trialStoreCost??null}:null;
   return {id:plan.id,name:plan.name,active:plan.isActive,price:plan.price,cost:plan.storeCost,trial,version,confirmedAt:confirmed?toLocalDateStr(confirmed.createdAt):null,issue:!settings.success&&plan.chargeSettings!==null?'收費格式需核對':trial&&trial.cost===null?'體驗成本未設定':plan.storeCost===0&&!confirmed?'零成本待確認':null};
  });
  const purchases=orders.map(order=>{
   const quote=audits.find(a=>a.targetType==='CoursePurchase'&&a.targetId===order.id);
   const snapshot=coursePurchaseCostSnapshot.safeParse(quote?.afterJson);
   const zeroConfirmed=snapshot.success&&!!snapshot.data.feeVersion&&audits.some(a=>a.targetType==='CoursePointPlan'&&a.targetId===snapshot.data.planId&&object(a.afterJson)?.version===snapshot.data.feeVersion);
   const refunded=order.refunds.reduce((n,r)=>n+r.amount,0);
   const check=purchaseCostReview({received:order.price,refunds:refunded,due:tuition.get(order.id)?.due,zeroConfirmed,snapshot:quote?.afterJson});
   return {id:order.id,name:order.name,date:toLocalDateStr(order.confirmedAt!),received:order.price,refunds:refunded,...check,...(order.status==='VOIDED'?{difference:null,issue:'已作廢，不列入差額'}:{})};
  });
  const receipts=trials.map(receipt=>{
   const audit=audits.find(a=>a.targetType==='CourseBooking'&&a.targetId===receipt.bookingId&&object(a.afterJson)?.paymentId===receipt.id);
   const pricing=object(object(audit?.afterJson)?.pricingSnapshot);
   const scheduled=courseChargeSnapshot.safeParse(receipt.booking.session.chargeSnapshot);
   // Never consult today's fee; old unknown cost stays unknown.
   const auditCost=pricing?.storeCost;
   const cost=pricing&&Object.hasOwn(pricing,'storeCost')?(typeof auditCost==='number'&&Number.isSafeInteger(auditCost)&&auditCost>=0?auditCost:null):scheduled.success?scheduled.data.settings.trialStoreCost??null:null;
   const voided=!!receipt.voidedAt;
   return {id:receipt.id,name:receipt.booking.session.nameSnapshot,date:toLocalDateStr(receipt.createdAt),received:receipt.amount,cost,difference:!voided&&cost!==null?receipt.amount-cost:null,issue:voided?'已作廢／更正，不列入差額':cost===null?'缺少收款或排課當下成本':null,voidedAt:receipt.voidedAt?toLocalDateStr(receipt.voidedAt):null};
  });
  const feeLines=payroll?(musicDataScope(storeId,dataScope)==='legacy'?payroll.legacyTestLines:payroll.lines).filter(l=>l.kind==='FEE').map(l=>({id:l.id,name:l.label,teacher:l.name,date:toLocalDateStr(new Date(l.date)),amount:l.amount,paid:l.paid,issue:l.issue??(l.amount!==null&&l.paid>l.amount?'已付超過應付，請核對':null)})):null;
  return {month,catalog,purchases,receipts,fees:feeLines};
 },{isolationLevel:'RepeatableRead',timeout:20000});
}
export type CourseCostReview=Awaited<ReturnType<typeof getCourseCostReview>>;
