import 'server-only';
import {beautyPrisma} from '@/lib/beauty-db';
import {prisma} from '@/lib/db';
import {requireBeauty} from '@/server/beauty/access';
import {hasStoreFeature,requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {formatTWTime,toLocalDateStr} from '@/lib/date-utils';
import {BEAUTY_EXPORT_LABELS,beautyExportStatusLabel} from '@/lib/beauty/data-export';
import type {DataExportType} from '@/lib/data-export-labels';
import {getBeautyRevenueReport} from './beauty-revenue-report';
import {beautyTransactionRevisions} from '@/server/beauty/transaction-revisions';
import type {BeautyPurchase} from '../../../generated/beauty-client';
import {AppError} from '@/lib/errors';

type Sheet={name:string;headers:string[];rows:unknown[][]};
/** Original export entry authorizes each scope. No health, internal notes or binding credentials. */
export async function getBeautyDataExport(storeId:string,type:DataExportType,period:{gte:Date;lte:Date},status:string|undefined,limit:number,options:{customers:boolean;now?:Date;revenueStaffId?:string}={customers:false}):Promise<Sheet[]>{
 if(!['customers','transactions','bookings','wallets'].includes(type))throw new AppError('VALIDATION','不支援的匯出類型');
 await requireBeauty(storeId);options={...options,customers:options.customers&&await hasStoreFeature(storeId,FEATURES.CUSTOMER_MANAGEMENT)};await requireStoreFeature(storeId,({customers:FEATURES.CUSTOMER_MANAGEMENT,transactions:FEATURES.TRANSACTION_MANAGEMENT,bookings:FEATURES.BASIC_BOOKING,wallets:FEATURES.PLAN_MANAGEMENT})[type]);
 const take=limit+1,now=options.now??new Date(),stamp=(d:Date|null)=>d?formatTWTime(d):'';
 const namesFor=async(ids:string[])=>options.customers?new Map((await prisma.customer.findMany({where:{storeId,id:{in:[...new Set(ids)]}},select:{id:true,name:true}})).map(c=>[c.id,c.name])):new Map<string,string>();
 if(type==='customers'){
  const rows=await prisma.customer.findMany({where:{storeId,mergedIntoCustomerId:null,createdAt:period,...(status?{customerStage:status as never}:{})},select:{id:true,name:true,phone:true,email:true,createdAt:true,assignedStaff:{select:{storeId:true,displayName:true}}},orderBy:{createdAt:'desc'},take});
  const visits=rows.length?await beautyPrisma.beautyAppointment.groupBy({by:['customerId'],where:{storeId,status:'COMPLETED',customerId:{in:rows.map(c=>c.id)}},_min:{startsAt:true},_max:{startsAt:true}}):[];
  return [{name:BEAUTY_EXPORT_LABELS[type],headers:['姓名','電話','Email','所屬店長','首次服務','最近服務','建立時間'],rows:rows.map(c=>[c.name,c.phone,c.email,c.assignedStaff?.storeId===storeId?c.assignedStaff.displayName:'未指派',stamp(visits.find(v=>v.customerId===c.id)?._min.startsAt??null),stamp(visits.find(v=>v.customerId===c.id)?._max.startsAt??null),stamp(c.createdAt)])}];
 }
 if(type==='transactions'){
  const report=await getBeautyRevenueReport(storeId,{startDate:toLocalDateStr(period.gte),endDate:toLocalDateStr(period.lte),storeFilter:{},coachId:options.revenueStaffId},{customers:options.customers});
  const matched=report.data.filter(r=>!status||(status==='REFUNDED'?r.refund:status==='CONFIRMED'?!r.refund:false)).slice(0,take);
  // Pending requests have no frozen attribution until explicitly corrected; never
  // infer old ownership from today's customer assignment.
  const requests=await beautyPrisma.$queryRaw<BeautyPurchase[]>`SELECT q.* FROM "BeautyPurchase" q
   LEFT JOIN LATERAL (SELECT "revenueStaffId" FROM "BeautyTransactionRevision" m WHERE m."storeId"=q."storeId" AND m."transactionId"=q.id ORDER BY revision DESC LIMIT 1) m ON true
   WHERE q."storeId"=${storeId} AND q."createdAt">=${period.gte} AND q."createdAt"<=${period.lte}
   AND (${status??null}::text IS NULL OR q.status=${status??null}) AND (${options.revenueStaffId??null}::text IS NULL OR m."revenueStaffId"=${options.revenueStaffId??null})
   ORDER BY q."createdAt" DESC,q.id LIMIT ${take}`;
  const corrections=await beautyPrisma.beautyTransactionRevision.findMany({where:{storeId,voidedAt:{not:null}},orderBy:{revision:'desc'}});
  const voided=(!status||status==='VOIDED')?await beautyPrisma.beautyPayment.findMany({where:{storeId,kind:'SALE',createdAt:period,id:{in:corrections.filter(r=>!options.revenueStaffId||r.revenueStaffId===options.revenueStaffId).map(r=>r.transactionId)}},orderBy:{createdAt:'desc'},take}):[];
  const revisions=await beautyTransactionRevisions(beautyPrisma,storeId,[...requests.map(q=>q.id),...voided.map(p=>p.id)]);

  const names=await namesFor(requests.map(q=>q.customerId));
  return [{name:'收退款發生',headers:['收據編號','發生時間','顧客','服務／方案','金額（退款為負）','方式','狀態','操作人員'],rows:matched.map(r=>[r.id,stamp(new Date(r.createdAt)),r.customerName,r.planName,r.netAmount,r.paymentMethod,r.refund?'已退款':'已收款',r.createdByName])},{name:'購買申請',headers:['申請編號','申請時間','顧客','狀態','方案卡編號','說明'],rows:requests.map(q=>[q.id,stamp(q.createdAt),names.get(q.customerId)??'顧客',beautyExportStatusLabel(type,q.status),q.cardId??'','申請紀錄不作營收加總；以收退款發生表為準'])},{name:'作廢誤建',headers:['原收據編號','原收款時間','原金額（不計營收）','作廢時間','作廢原因'],rows:voided.map(p=>[p.id,stamp(p.createdAt),p.amount,stamp(revisions.get(p.id)?.voidedAt??null),revisions.get(p.id)?.voidReason??''])}];
 }
 if(type==='bookings'){
  const rows=await beautyPrisma.beautyAppointment.findMany({where:{storeId,startsAt:period,...(status?{status}:{})},orderBy:[{startsAt:'desc'},{id:'asc'}],take});
  const [techs,locations]=await Promise.all([beautyPrisma.beautyTechnician.findMany({where:{storeId},select:{id:true,name:true}}),prisma.$queryRaw<{id:string;name:string}[]>`SELECT id,name FROM "CourseRoom" WHERE "storeId"=${storeId}`]);
  return [{name:BEAUTY_EXPORT_LABELS[type],headers:['開始時間','結束時間','服務項目','服務者（預約時姓名）','技師','位置','狀態','使用方案','已扣次'],rows:rows.map(b=>[stamp(b.startsAt),stamp(b.endsAt),b.serviceName,options.customers?b.personName:'顧客',techs.find(t=>t.id===b.technicianId)?.name??'待核對',locations.find(l=>l.id===b.locationId)?.name??'待核對',beautyExportStatusLabel(type,b.status),b.cardId??'',b.debit?1:0])}];
 }
 const cards=await beautyPrisma.beautyCard.findMany({where:{storeId,createdAt:period,...(status==='CLOSED'?{closedAt:{not:null}}:status==='EXPIRED'?{closedAt:null,expiresAt:{lte:now}}:status==='ACTIVE'?{closedAt:null,expiresAt:{gt:now}}:{})},orderBy:{createdAt:'desc'},take});
 const [names,holds]=await Promise.all([namesFor(cards.flatMap(c=>c.memberIds)),cards.length?beautyPrisma.beautyAppointment.groupBy({by:['cardId'],where:{storeId,cardId:{in:cards.map(c=>c.id)},status:'RESERVED'},_count:{id:true}}):[]]);
 return [{name:BEAUTY_EXPORT_LABELS[type],headers:['卡片編號','方案','共卡授權成員','剩餘','預約占用','可用','單位','到期日','狀態','發卡時間','說明'],rows:cards.map(card=>{const held=holds.find(h=>h.cardId===card.id)?._count.id??0,state=card.closedAt?'CLOSED':card.expiresAt<=now?'EXPIRED':'ACTIVE';return [card.id,card.name,options.customers?card.memberIds.map(id=>names.get(id)??'顧客').join('、'):'顧客',card.remaining,held,state==='ACTIVE'?Math.max(0,card.remaining-held):0,'次',stamp(card.expiresAt),beautyExportStatusLabel('wallets',state),stamp(card.createdAt),'每張共卡只列一次，占用尚未扣次'];})}];
}
