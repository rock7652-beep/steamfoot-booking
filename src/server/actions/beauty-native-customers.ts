"use server";
import {beautyReadStep,traceBeautyRead} from "@/server/beauty/read-timing";
import {withBeautyReadScope,withBeautyCheckoutScope} from '@/server/beauty/request-scope';
import {permissionRequestSession} from '@/lib/permission-request-session';
import {after} from 'next/server';
import {beautyTransactionRevisions} from "@/server/beauty/transaction-revisions";

import {z} from 'zod';
import {prisma} from '@/lib/db';
import {beautyPrisma} from '@/lib/beauty-db';
import {beautyManager,beautyTransaction} from '@/server/beauty/access';
import {requireSession} from '@/lib/session';
import {getManagerCustomerWhere} from '@/lib/manager-visibility';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {AppError,handleActionError} from '@/lib/errors';
import {courseBalanceTotals} from '@/lib/course-balance-summary';
import {courseHistoryRange} from '@/lib/course-history-range';
import {toLocalDateStr} from '@/lib/date-utils';
import {courseCheckoutSchema,calculateCourseCheckout} from '@/lib/course-checkout';
import {serviceCharges} from '@/server/beauty/service-charges';
import {beautyChargeRulesEnabled} from '@/server/beauty/charge-runtime';
import {issueCard} from '@/server/beauty/commerce';
import {cardInput,planInput} from '@/lib/beauty/contracts';
import {saveCourseCustomer} from './course-members';
import {saveCourseCustomerNote} from './course-customer-note';
import {updateBeautyCardMembers} from './beauty';
import {revalidatePath} from 'next/cache';
import {settingsSaveUncertain} from '@/server/services/settings-save-error';

const id=z.string().min(1).max(180);
function failure(error:unknown){const result=handleActionError(error);return {success:false as const,error:result.success?'讀取失敗，請重試':result.error};}
async function scope(permission:'wallet.read'|'booking.read'|'transaction.read'|'customer.read'='customer.read',target?:{customerIds?:string[];cardId?:string}){
 const a=await beautyReadStep('authorization',()=>beautyManager(permission));
 if(permission!=='customer.read')await beautyReadStep('customer_permission',()=>beautyManager('customer.read'));
 await requireStoreFeature(a.storeId,FEATURES.CUSTOMER_MANAGEMENT);
 if(permission==='wallet.read')await requireStoreFeature(a.storeId,FEATURES.PLAN_MANAGEMENT);
 const user=await permissionRequestSession(()=>requireSession());
 const customerWhere={...getManagerCustomerWhere(user.role,user.staffId,a.storeId),storeId:a.storeId,mergedIntoCustomerId:null};
 const selected=target?.cardId?(await beautyPrisma.beautyCard.findFirst({where:{id:target.cardId,storeId:a.storeId},select:{memberIds:true}}))?.memberIds??[]:target?.customerIds;
 const people=await beautyReadStep('customer_scope',()=>prisma.customer.findMany({where:{...customerWhere,...(selected?{id:{in:selected}}:{})},select:{id:true,name:true,phone:true}}));
 return {...a,people,customerWhere,ids:people.map(p=>p.id)};
}
function customerExists(s:{ids:string[]},customerId:string){if(!s.ids.includes(customerId))throw new AppError('NOT_FOUND','找不到本店可查看的顧客');}
export async function browseBeautyNativeCards(input:unknown){
 return withBeautyReadScope(()=>browseBeautyNativeCardsCore(input));
}
async function browseBeautyNativeCardsCore(input:unknown){
 try{
  const d=z.object({customerId:id.optional(),cardId:id.optional(),search:z.string().trim().max(200).default(''),history:z.boolean().default(false),page:z.number().int().min(0).max(50000).default(0)}).parse(input);
  const s=await scope('wallet.read',d.cardId?{cardId:d.cardId}:d.customerId?{customerIds:[d.customerId]}:undefined);if(d.customerId)customerExists(s,d.customerId);
  const searchPeople=d.customerId&&d.search?await prisma.customer.findMany({where:{...s.customerWhere,OR:[{name:{contains:d.search,mode:'insensitive'}},{phone:{contains:d.search,mode:'insensitive'}}]},select:{id:true,name:true,phone:true}}):s.people;
  const matching=searchPeople.filter(p=>[p.name,p.phone].some(v=>v.toLowerCase().includes(d.search.toLowerCase()))).map(p=>p.id);
  const where={storeId:s.storeId,memberIds:{hasSome:d.customerId?[d.customerId]:s.ids}};
  const [cards,balances]=await beautyReadStep('cards',()=>Promise.all([
   beautyPrisma.beautyCard.findMany({where:{...where,...(d.cardId?{id:d.cardId}:d.history?{OR:[{closedAt:{not:null}},{expiresAt:{lt:new Date()}}]}:{closedAt:null,expiresAt:{gte:new Date()}}),...(d.search?{AND:[{OR:[{name:{contains:d.search,mode:'insensitive'}},{memberIds:{hasSome:matching}}]}]}:{})},orderBy:[{expiresAt:'asc'},{id:'asc'}],skip:d.cardId?0:d.page*20,take:d.cardId?1:21}),
   d.customerId&&!d.cardId?beautyPrisma.beautyCard.findMany({where:{...where,closedAt:null,expiresAt:{gte:new Date()}}}):Promise.resolve([]),
  ]));
  const all=[...cards,...balances];
  if(d.customerId){s.people=await prisma.customer.findMany({where:{...s.customerWhere,id:{in:[...new Set(all.flatMap(c=>c.memberIds))]}},select:{id:true,name:true,phone:true}});s.ids=s.people.map(p=>p.id);}
  const cardIds=[...new Set(all.map(c=>c.id))];
  const [held,entries]=await beautyReadStep('holds_ledger',()=>Promise.all([
   beautyPrisma.beautyAppointment.groupBy({by:['cardId'],where:{storeId:s.storeId,cardId:{in:cardIds},status:'RESERVED'},_count:{id:true}}),
   d.cardId?beautyPrisma.beautyLedger.findMany({where:{storeId:s.storeId,cardId:{in:cards.map(c=>c.id)}},orderBy:[{createdAt:'desc'},{id:'desc'}],take:100}):Promise.resolve([]),
  ]));
  const project=(c:typeof cards[number])=>{
   const reserved=held.find(h=>h.cardId===c.id)?._count.id??0,expired=c.expiresAt.getTime()<Date.now();
   return {id:c.id,planId:'plan:'+c.planId,name:c.name,unit:'SESSION' as const,musicValidityDays:null,musicActivatedAt:null,templateIds:c.serviceIds,termSessionIds:[],allowShared:c.allowShared,remaining:c.remaining,held:reserved,closed:!!c.closedAt,available:expired||c.closedAt?0:Math.max(0,c.remaining-reserved),expired,expiresAt:c.expiresAt.toISOString(),members:c.memberIds.filter(memberId=>s.ids.includes(memberId)).map(memberId=>({id:memberId,name:s.people.find(p=>p.id===memberId)?.name??'顧客',phone:s.people.find(p=>p.id===memberId)?.phone??''})),entries:entries.filter(e=>e.cardId===c.id).map(e=>({id:e.id,kind:e.kind,points:e.delta,createdAt:e.createdAt.toISOString()}))};
  };
  return {success:true as const,rows:cards.slice(0,20).map(project),hasMore:cards.length>20,totals:d.customerId&&!d.cardId?courseBalanceTotals(balances.map(project)):undefined};
 }catch(error){return failure(error);}
}
export async function readBeautyNativeCardReservations(input:unknown){
 try{
  const d=z.object({cardId:id,page:z.number().int().min(0).max(50000).default(0)}).parse(input),s=await scope('wallet.read',{cardId:d.cardId});await beautyManager('booking.read');
  const c=await beautyPrisma.beautyCard.findFirst({where:{id:d.cardId,storeId:s.storeId,memberIds:{hasSome:s.ids}},select:{id:true}});
  if(!c)throw new AppError('NOT_FOUND','找不到本店方案');
  const rows=await beautyPrisma.beautyAppointment.findMany({where:{storeId:s.storeId,cardId:c.id,status:'RESERVED',customerId:{in:s.ids}},orderBy:[{startsAt:'asc'},{id:'asc'}],skip:d.page*20,take:21});
  return {success:true as const,scoped:true,hasMore:rows.length>20,rows:rows.slice(0,20).map(b=>({id:b.id,customerName:b.personName,amount:1,name:b.serviceName,startsAt:b.startsAt.toISOString()}))};
 }catch(error){return failure(error);}
}
export async function readBeautyNativeCustomerBookings(customerId:string,offset=0,range:{from?:string;to?:string}={}){
 try{
  const s=await scope('booking.read',{customerIds:[id.parse(customerId)]});customerExists(s,customerId);const skip=z.number().int().min(0).max(1000000).parse(offset);
  const rows=await beautyPrisma.beautyAppointment.findMany({where:{storeId:s.storeId,customerId,startsAt:courseHistoryRange(range)},orderBy:[{startsAt:'desc'},{id:'desc'}],skip,take:11});
  const [cards,techs]=await Promise.all([beautyPrisma.beautyCard.findMany({where:{storeId:s.storeId,id:{in:rows.flatMap(b=>b.cardId?[b.cardId]:[])}}}),beautyPrisma.beautyTechnician.findMany({where:{storeId:s.storeId,id:{in:rows.map(b=>b.technicianId)}},select:{id:true,name:true}})]);
  return {success:true as const,hasMore:rows.length>10,data:rows.slice(0,10).map(b=>{const c=cards.find(c=>c.id===b.cardId);return {id:b.id,absenceKind:null,coachName:techs.find(t=>t.id===b.technicianId)?.name,name:b.serviceName,date:b.startsAt.toISOString(),status:b.status==='COMPLETED'?'ATTENDED':b.status,checkedIn:false,plan:c?.name??'單次服務',expiresAt:c?.expiresAt.toISOString()??null,points:c?1:0,unit:c?'SESSION':'TRIAL',notes:b.notes,operator:'',service:{debit:b.debit,isTrial:b.isTrial}};})};
 }catch(error){return failure(error);}
}
export async function readBeautyNativeCustomerPurchases(input:unknown,offset=0,range:{from?:string;to?:string}={}){
 try{
  const customerId=id.parse(input),s=await scope('transaction.read',{customerIds:[customerId]});customerExists(s,customerId);const skip=z.number().int().min(0).max(1000000).parse(offset);
  const [cards,appointments]=await Promise.all([beautyPrisma.beautyCard.findMany({where:{storeId:s.storeId,customerId}}),beautyPrisma.beautyAppointment.findMany({where:{storeId:s.storeId,customerId},select:{id:true,serviceName:true,price:true}})]);
  const bounds=courseHistoryRange(range),from=bounds.gte??new Date('1900-01-01T00:00:00Z'),to=bounds.lte??new Date('9999-01-01T00:00:00Z');
  // One ordered page across issued sales and still-unconfirmed requests; confirmed
  // requests are represented by their real sale receipt exactly once.
  const page=await beautyPrisma.$queryRaw<Array<{id:string;kind:string}>>`
    SELECT id,kind FROM (
      SELECT p.id,'SALE'::text AS kind,p."createdAt" FROM "BeautyPayment" p
      WHERE p."storeId"=${s.storeId} AND p.kind='SALE' AND p."createdAt">=${from} AND p."createdAt"<=${to}
      AND (p."cardId"=ANY(${cards.map(c=>c.id)}::text[]) OR p."appointmentId"=ANY(${appointments.map(b=>b.id)}::text[]))
      UNION ALL
      SELECT q.id,'REQUEST'::text AS kind,q."createdAt" FROM "BeautyPurchase" q
      WHERE q."storeId"=${s.storeId} AND q."customerId"=${customerId} AND q.status<>'CONFIRMED' AND q."cardId" IS NULL
      AND q."createdAt">=${from} AND q."createdAt"<=${to}
    ) history ORDER BY "createdAt" DESC,id DESC LIMIT 11 OFFSET ${skip}`;
  const [payments,requests]=await Promise.all([
    beautyPrisma.beautyPayment.findMany({where:{storeId:s.storeId,kind:'SALE',id:{in:page.filter(p=>p.kind==='SALE').map(p=>p.id)}}}),
    beautyPrisma.beautyPurchase.findMany({where:{storeId:s.storeId,customerId,id:{in:page.filter(p=>p.kind==='REQUEST').map(p=>p.id)}}}),
  ]);
  const refunds=await beautyPrisma.beautyPayment.findMany({where:{storeId:s.storeId,kind:'REFUND',originalPaymentId:{in:payments.map(p=>p.id)}},orderBy:{createdAt:'desc'}});
  const revisions=await beautyTransactionRevisions(beautyPrisma,s.storeId,page.map(row=>row.id));
  const sales=payments.map(p=>{const c=cards.find(c=>c.id===p.cardId),b=appointments.find(b=>b.id===p.appointmentId),rs=refunds.filter(r=>r.originalPaymentId===p.id);return {id:p.id,name:c?.name??b?.serviceName??'服務收款',price:p.amount,points:c?.sessions??0,unit:c?'SESSION':'TRIAL',status:revisions.get(p.id)?.voidedAt?'VOIDED':rs.reduce((n,r)=>n-r.amount,0)>=p.amount&&rs.length?'REFUNDED':'CONFIRMED',listPrice:c?.listPrice??b?.price??p.amount,discountKind:null,discountValue:null,paymentMethod:p.method,transferLastFour:p.note.match(/轉帳末四碼 (\d{4})/)?.[1]??null,createdAt:p.createdAt.toISOString(),confirmedAt:p.createdAt.toISOString(),note:revisions.get(p.id)?.note??p.note,voidReason:revisions.get(p.id)?.voidReason??null,refunds:rs.map(r=>({id:r.id,amount:-r.amount,method:r.method,reason:r.note,createdAt:r.createdAt.toISOString()}))};});
  const pending=requests.map(q=>{const p=planInput.parse(q.snapshot);return {id:q.id,name:p.name,price:p.price,points:p.sessions,unit:'SESSION',status:q.status==='PENDING'?'PENDING':'VOIDED',listPrice:p.price,discountKind:null,discountValue:null,paymentMethod:'BANK_TRANSFER',transferLastFour:q.lastFour,createdAt:q.createdAt.toISOString(),confirmedAt:null,note:revisions.get(q.id)?.note??'',voidReason:revisions.get(q.id)?.voidReason??null,refunds:[]};});
  return {success:true as const,hasMore:page.length>10,data:page.slice(0,10).flatMap(p=>[...sales,...pending].filter(r=>r.id===p.id))};
 }catch(error){return failure(error);}
}
export async function beautyNativeCheckoutCashStatus(){
 try{const a=await beautyManager('transaction.create');await beautyManager('wallet.create');await requireStoreFeature(a.storeId,FEATURES.PLAN_MANAGEMENT);const day=new Date(toLocalDateStr()+'T00:00:00Z');const rows=await beautyPrisma.$queryRaw<Array<{status:string}>>`SELECT status::text FROM "CashDrawerSession" WHERE "storeId"=${a.storeId} AND "businessDate"=${day}`;return {success:true as const,status:rows[0]?.status??null};}catch(error){return failure(error);}
}
export async function saveBeautyNativeCustomerProfile(input:Record<string,unknown>){return (await traceBeautyRead('customer.profile.write',()=>saveCourseCustomer(input,'beauty'))).value;}
export async function saveBeautyNativeCustomerNote(input:Parameters<typeof saveCourseCustomerNote>[0]){return (await traceBeautyRead('customer.note.write',()=>saveCourseCustomerNote(input,'beauty'))).value;}
export async function saveBeautyNativeCardMembers(input:Record<string,unknown>){
 const d=z.object({cardId:id,expected:z.array(id),customerIds:z.array(id),requestKey:z.string().uuid()}).safeParse(input);if(!d.success)return failure(new AppError('VALIDATION','請重新核對方案成員'));
 return updateBeautyCardMembers({id:d.data.cardId,expected:d.data.expected,memberIds:d.data.customerIds,requestKey:d.data.requestKey});
}
export async function assignBeautyNativeCard(input:Record<string,unknown>){return withBeautyCheckoutScope(async()=>(await traceBeautyRead('customer.purchase.write',()=>assignBeautyNativeCardCore(input))).value);}
async function assignBeautyNativeCardCore(input:Record<string,unknown>){
 let committed=false;
 try{
  const d=courseCheckoutSchema.extend({customerId:id,planId:id,expiresDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),requestKey:z.string().uuid(),expectedStoreId:id,beautyExpectedStoreCost:z.number().int().nonnegative().nullable().optional(),beautyRosterSessionId:z.string().min(1).max(200).optional()}).parse(input);
  const [a,financial,s]=await beautyReadStep('checkout_access',()=>Promise.all([beautyManager('wallet.create',true),beautyManager('transaction.create',true),scope('customer.read',{customerIds:[d.customerId]})]));if(a.storeId!==financial.storeId||a.userId!==financial.userId||s.storeId!==a.storeId)throw new AppError('FORBIDDEN','店家範圍不一致');await beautyReadStep('checkout_feature',()=>requireStoreFeature(a.storeId,FEATURES.PLAN_MANAGEMENT));
  if(d.expectedStoreId!==a.storeId)throw new AppError('CONFLICT','目前門市已切換，請重新開啟結帳');
  customerExists(s,d.customerId);
  if(d.revenueStaffId||d.expectedStoreCost||d.musicPurchaseTerms||d.musicValidityDays||d.musicManualBonus||d.musicJoinSessionId)throw new AppError('VALIDATION','此服務方案不使用課程期數或成本欄位');
  if(d.discountValue)await beautyManager('wallet.adjust',true);
  if(d.paymentMethod==='BANK_TRANSFER'&&!/^\d{4}$/.test(d.transferLastFour))throw new AppError('VALIDATION','請填寫轉帳末四碼');
  const paid=calculateCourseCheckout(d.expectedListPrice,d.discountKind,d.discountValue).paid;
  const result=await beautyReadStep('checkout_transaction',()=>beautyTransaction(a,tx=>issueCard(tx,a,cardInput.parse({planId:d.planId.replace(/^plan:/,''),customerId:d.customerId,memberIds:[],paid,method:d.paymentMethod,requestKey:d.requestKey}),undefined,{expiresDate:d.expiresDate,expectedListPrice:d.expectedListPrice,expectedStoreCost:d.beautyExpectedStoreCost,transferLastFour:d.transferLastFour})));
  committed=true;
  // Profile checkout uses the same independently authorized card reader as the
  // panel. A failed read must not turn a committed payment into a retry.
  let checkoutCards: {customerId:string;result:Extract<Awaited<ReturnType<typeof browseBeautyNativeCards>>,{success:true}>}|undefined;
  if(!d.beautyRosterSessionId){try{
   const current=await beautyReadStep('purchase.cards',()=>browseBeautyNativeCards({customerId:d.customerId}));
   if(current.success)checkoutCards={customerId:d.customerId,result:current};
  }catch{/* Keep committed purchase successful; the panel retains its reader. */}}
  let rosterSnapshot: {sessionId:string;data:import('@/app/(dashboard)/dashboard/courses/roster-source').CourseRosterData}|undefined;
  if(d.beautyRosterSessionId){try{
   const {readBeautyNativeRoster}=await import('./beauty-native-roster');
   const current=await beautyReadStep('purchase.roster',()=>readBeautyNativeRoster(d.beautyRosterSessionId!));
   if(current.success&&current.data.roster.some(row=>row.customerId===d.customerId))rosterSnapshot={sessionId:d.beautyRosterSessionId,data:current.data};
  }catch{/* Keep committed purchase successful; the scoped roster reader is the fallback. */}}
  let syncWarning=false;try{after(()=>{try{revalidatePath('/dashboard/beauty');}catch{console.error('[beauty-checkout] committed; invalidation failed');}});}catch{syncWarning=true;}return {success:true as const,data:result,syncWarning,...(checkoutCards?{checkoutCards}:{}),...(rosterSnapshot?{rosterSnapshot}:{})};
 }catch(error){return {...failure(error),uncertain:committed||settingsSaveUncertain(error)};}
}

/** Only the chosen visible customer's existing service receipts; never a prepaid card sale. */
export async function readBeautyNativeSingleServices(input:unknown,offset=0){
 try{
  const customerId=id.parse(input),skip=z.number().int().min(0).max(1000000).parse(offset);
  const s=await scope('booking.read',{customerIds:[customerId]});customerExists(s,customerId);
  await beautyManager('transaction.create');await requireStoreFeature(s.storeId,FEATURES.TRANSACTION_MANAGEMENT);
  return await beautyTransaction(s,async tx=>{
   const [items,catalog]=await Promise.all([
    tx.beautyAppointment.findMany({where:{storeId:s.storeId,customerId,cardId:null,status:{not:'CANCELLED'}},orderBy:[{startsAt:'desc'},{id:'desc'}],skip,take:21}),
    beautyChargeRulesEnabled(s.storeId)?tx.$queryRaw<Array<{id:string;name:string|null;configured:boolean|null}>>`SELECT id,"singleChargeName" AS name,"singlePriceConfigured" AS configured FROM "BeautyService" WHERE "storeId"=${s.storeId} AND active=true`:Promise.resolve(null),
   ]);
   const page=items.slice(0,20),charges=await serviceCharges(tx,s.storeId,page);
   return {success:true as const,storeId:s.storeId,customerId,catalog,hasMore:items.length>20,rows:page.flatMap(b=>{const charge=charges.find(c=>c.id===b.id);return charge&&charge.due>0?[{id:b.id,serviceId:b.serviceId,name:b.serviceName,isTrial:b.isTrial,startsAt:b.startsAt.toISOString(),price:charge.netPrice,collected:charge.collected,due:charge.due}]:[]})};
  });
 }catch(error){return failure(error);}
}
