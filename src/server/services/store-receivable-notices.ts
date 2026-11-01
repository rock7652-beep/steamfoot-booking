import 'server-only';
import {randomUUID} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import {prisma} from '@/lib/db';
import {noticeWindow} from '@/lib/store-notice-lifecycle';
import {outstandingAmount} from '@/lib/receivable-notice';
import {beautyServiceQuote} from '@/lib/beauty/service-charge';
import {musicNativeWorkflowEnabled} from './music-native-workflow';
import {beautyCollectionIntentsEnabled} from '@/server/beauty/collection-intent';

type Reader=Pick<Prisma.TransactionClient,'$queryRaw'>;
type Module='steamfoot'|'course'|'beauty';
export type StoreReceivable={key:string;targetId:string;customerName:string;amount:number;at:Date;targetAt?:Date;suspended?:boolean};
type QuoteRow={id:string;customerName:string;amount:number;at:Date;bookingId?:string;targetAt?:Date};
/** Read the industry's confirmed obligation, never list-price minus an accepted final receipt.
 * The caller must establish the store scope first. No financial operation is performed. */
export async function readStoreReceivables(tx:Reader,storeId:string,industry:Module,now=new Date()):Promise<StoreReceivable[]> {
 const after=noticeWindow(false,now).retainedAfter;
 const map=(rows:QuoteRow[],source:string)=>rows.filter(r=>outstandingAmount(r.amount,0)>0).map(r=>({key:`${industry}-receivable:${source}:${r.id}`,targetId:r.bookingId??r.id,customerName:r.customerName,amount:r.amount,at:r.at,targetAt:r.targetAt}));
 if(industry==='steamfoot'){
  // Cash checkout accepts its final discounted amount as settlement. A successful
  // receipt therefore settles the service; its list-price difference is never debt.
  const rows=await tx.$queryRaw<QuoteRow[]>`SELECT b.id,c.name AS "customerName",b."expectedAmount"::int AS amount,b."updatedAt" AS at FROM public."Booking" b JOIN public."Customer" c ON c.id=b."customerId" AND c."storeId"=b."storeId"
   WHERE b."storeId"=${storeId} AND b."bookingStatus"='COMPLETED' AND b."bookingType"::text IN ('FIRST_TRIAL','SINGLE') AND b."customerPlanWalletId" IS NULL AND b."expectedAmount">0 AND coalesce(b."attendedPeople",b.people)=b.people AND b."updatedAt">${after} AND b."updatedAt"<=${now}
   AND NOT EXISTS(SELECT 1 FROM public."BookingParticipantGroup" g WHERE g."storeId"=b."storeId" AND g."bookingId"=b.id)
   AND NOT EXISTS(SELECT 1 FROM public."Transaction" t WHERE t."storeId"=b."storeId" AND t."bookingId"=b.id AND t."transactionType" IN ('TRIAL_PURCHASE','SINGLE_PURCHASE','PACKAGE_PURCHASE'))`;
  const people=await tx.$queryRaw<QuoteRow[]>`SELECT p.id,b.id AS "bookingId",coalesce(c.name,'顧客') AS "customerName",p."expectedAmount"::int AS amount,p."completedAt" AS at FROM public."BookingParticipant" p JOIN public."BookingParticipantGroup" g ON g.id=p."groupId" AND g."storeId"=p."storeId" JOIN public."Booking" b ON b.id=g."bookingId" AND b."storeId"=p."storeId" LEFT JOIN public."Customer" c ON c.id=p."customerId" AND c."storeId"=p."storeId"
   WHERE p."storeId"=${storeId} AND p.status='COMPLETED' AND b."bookingStatus"::text NOT IN ('CANCELLED','NO_SHOW') AND p.service IN ('FIRST_TRIAL','SINGLE') AND p."walletSessionId" IS NULL AND p."collectionTransactionId" IS NULL AND p."expectedAmount">0 AND p."completedAt">${after} AND p."completedAt"<=${now}
   AND NOT EXISTS(SELECT 1 FROM public."Transaction" t WHERE t."storeId"=p."storeId" AND (t."unregisteredParticipantId"=p.id OR t."bookingId"=b.id) AND t."transactionType" IN ('TRIAL_PURCHASE','SINGLE_PURCHASE','PACKAGE_PURCHASE'))`;
  return [...map(rows,'booking'),...map(people,'participant')];
 }
 if(industry==='course'){
  const rows=await tx.$queryRaw<QuoteRow[]>`SELECT b.id,b."customerName",b."trialPrice" AS amount,s."endsAt" AS at FROM public."CourseBooking" b JOIN public."CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId"
   WHERE b."storeId"=${storeId} AND b.status='ATTENDED' AND b."bookingKind"='TRIAL' AND b."cardId" IS NULL AND b."trialPrice">0 AND s."cancelledAt" IS NULL AND s."endsAt">${after} AND s."endsAt"<=${now}
   AND NOT EXISTS(SELECT 1 FROM public."CourseTrialPayment" p WHERE p."storeId"=b."storeId" AND p."bookingId"=b.id AND p.status='SUCCESS' AND p."voidedAt" IS NULL)`;
  const result=map(rows,'trial');
  if(musicNativeWorkflowEnabled(storeId)){
   const tuition=await tx.$queryRaw<(QuoteRow&{received:number;recorded:number})[]>`SELECT p.id,coalesce(c.name,'顧客') AS "customerName",t.due AS amount,p."createdAt" AS "targetAt",p."confirmedAt" AS at,p.price AS recorded,coalesce((SELECT sum(r.amount)::int FROM public."CourseMusicReceipt" r WHERE r."storeId"=p."storeId" AND r."purchaseId"=p.id),0) AS received FROM public."CoursePurchase" p JOIN public."CourseMusicTuition" t ON t."purchaseId"=p.id AND t."storeId"=p."storeId" LEFT JOIN public."Customer" c ON c.id=p."customerId" AND c."storeId"=p."storeId" WHERE p."storeId"=${storeId} AND p.status='CONFIRMED' AND p."voidedAt" IS NULL AND p."confirmedAt">${after} AND p."confirmedAt"<=${now}`;
   for(const r of tuition){if(r.received!==r.recorded)throw new Error('學費收款資料待核對');result.push(...map([{...r,amount:outstandingAmount(r.amount,r.received)}],'tuition'));}
  }
  return result;
 }
 // Same effective discount and signed, non-voided receipts as beauty serviceCharges.
 const rows=await tx.$queryRaw<(QuoteRow&{price:number;discountBody:string|null;received:number})[]>`SELECT b.id,b."personName" AS "customerName",b.price,b."endsAt" AS at,0 AS amount,
  (SELECT e.body FROM public."BeautyEvent" e WHERE e."storeId"=b."storeId" AND e."appointmentId"=b.id AND e.kind='SERVICE_DISCOUNT' AND e.status='AUDIT' ORDER BY e."createdAt" DESC,e.id DESC LIMIT 1) AS "discountBody",
  coalesce((SELECT sum(p.amount)::int FROM public."BeautyPayment" p WHERE p."storeId"=b."storeId" AND p."appointmentId"=b.id AND p.kind IN ('SALE','REFUND') AND NOT EXISTS(SELECT 1 FROM public."BeautyTransactionRevision" v WHERE v."storeId"=p."storeId" AND v."transactionId"=p.id AND v."voidedAt" IS NOT NULL)),0) AS received
  FROM public."BeautyAppointment" b WHERE b."storeId"=${storeId} AND b.status='COMPLETED' AND b."cardId" IS NULL AND b."endsAt">${after} AND b."endsAt"<=${now}`;
 const pending=beautyCollectionIntentsEnabled(storeId)?await tx.$queryRaw<{appointmentId:string}[]>`SELECT "appointmentId" FROM public."BeautyCollectionIntentItem" i JOIN public."BeautyCollectionIntent" c ON c."storeId"=i."storeId" AND c."requestKey"=i."requestKey" WHERE i."storeId"=${storeId} AND i.active AND c.status='PREPARED'`:[];
 return map(rows.map(r=>{
  return {...r,amount:outstandingAmount(beautyServiceQuote(r.price,r.discountBody).netPrice,r.received)};
 }),'service').map(r=>({...r,suspended:pending.some(p=>p.appointmentId===r.targetId)}));
}

/** Resolved financial notices disappear immediately on the next authorized read,
 * even before the background reconciliation. Amounts never go to booking-only users. */
export async function readReceivableNoticeState(tx:Reader,storeId:string,industry:Module,now=new Date()):Promise<Map<string,StoreReceivable>>{
 const rows=await tx.$queryRaw<{id:string;eventKey:string}[]>`SELECT id,"eventKey" FROM public."DigitalManagerNotice" WHERE "storeId"=${storeId} AND "eventType"='OUTSTANDING_PAYMENT' AND "handledAt" IS NULL AND "publishedAt">${noticeWindow(false,now).retainedAfter} AND "publishedAt"<=${now}`;
 const values=rows.length?await readStoreReceivables(tx,storeId,industry,now):[];
 const byKey=new Map(values.filter(v=>!v.suspended).map(v=>[v.key,v]));
 return new Map(rows.flatMap(r=>{const v=byKey.get(r.eventKey);return v?[[`digital:${r.id}`,v] as const]:[];}));
}

/** Reuses the existing 15-minute cron. No LINE sends, extra schedule, or financial writes.
 * A stable event key and source date prevent daily renewal of expired messages. */
export async function reconcileStoreReceivableNotices(now=new Date(),storeIds?:string[]){
 const stores=await prisma.store.findMany({where:{industryModule:{in:['STEAMFOOT','COURSE','BEAUTY']},isDemo:false,operatingStatus:{in:['ACTIVE','TRIAL']},...(storeIds?{id:{in:storeIds}}:{})},select:{id:true,industryModule:true}});
 let failed=0;
 for(const s of stores){try{await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM public."Store" WHERE id=${s.id} FOR UPDATE`;
  const industry=s.industryModule!.toLowerCase() as Module,values=await readStoreReceivables(tx,s.id,industry,now);
  for(const v of values.filter(v=>!v.suspended))await tx.$executeRaw`INSERT INTO public."DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId","createdAt","updatedAt") VALUES (${randomUUID()},${s.id},${v.key},'OUTSTANDING_PAYMENT',${v.targetId},${v.at},${now}) ON CONFLICT ("storeId","eventKey") DO NOTHING`;
  await tx.$executeRaw`UPDATE public."DigitalManagerNotice" SET "handledAt"=${now},"handledById"='system',"handledByName"='系統',revision=revision+1,"updatedAt"=${now} WHERE "storeId"=${s.id} AND "eventType"='OUTSTANDING_PAYMENT' AND "handledAt" IS NULL AND NOT ("eventKey"=ANY(${values.map(v=>v.key)}::text[]))`;
 },{isolationLevel:'Serializable',timeout:20000});}catch{failed++;console.error('[StoreReceivableNotice] store reconciliation failed',{storeId:s.id});}}
 return {stores:stores.length,failed};
}
