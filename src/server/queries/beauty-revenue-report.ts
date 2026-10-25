import 'server-only';
import {beautyCardSaleAttribution,beautyPaymentVisibility,beautyTransactionRevisions,beautySaleAllocations} from '@/server/beauty/transaction-revisions';
import {beautyReceiptAllocations,beautySaleShare} from '@/lib/beauty/receipt-allocation';
import {beautyPrisma} from '@/lib/beauty-db';
import {hasStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {prisma} from '@/lib/db';
import {requireBeauty} from '@/server/beauty/access';
import {dayRange,toLocalDateStr} from '@/lib/date-utils';
import {moduleRevenueReport,type ModuleRevenueRow} from '@/lib/module-revenue-report';
import type {ReportFilters} from '@/lib/report-queries';
import {AppError} from '@/lib/errors';

/** Trusted callers authorize report scope. PII is redacted unless independently granted. */
export async function getBeautyRevenueReport(storeId:string,filters:ReportFilters,access:{customers:boolean}={customers:false}){
 await requireBeauty(storeId);access={customers:access.customers&&await hasStoreFeature(storeId,FEATURES.CUSTOMER_MANAGEMENT)};
 for(const date of [filters.startDate,filters.endDate])if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new AppError('VALIDATION','日期格式不正確');
 if(filters.startDate>filters.endDate)throw new AppError('VALIDATION','開始日期不能晚於結束日期');
 const range={gte:dayRange(filters.startDate).start,lte:dayRange(filters.endDate).end};
 return beautyPrisma.$transaction(async tx=>{
  const payments=await tx.beautyPayment.findMany({where:{storeId,createdAt:range,kind:{in:['SALE','REFUND']},...(await beautyPaymentVisibility(tx,storeId))},orderBy:[{createdAt:'desc'},{id:'asc'}]});
  const originals=await tx.beautyPayment.findMany({where:{storeId,id:{in:payments.flatMap(p=>p.originalPaymentId?[p.originalPaymentId]:[])},kind:'SALE'}});
  const receipts=[...payments,...originals];
  const [cards,appointments,store,staff,attribution]=await Promise.all([
   tx.beautyCard.findMany({where:{storeId,id:{in:receipts.flatMap(p=>p.cardId?[p.cardId]:[])}}}),
   tx.beautyAppointment.findMany({where:{storeId,id:{in:receipts.flatMap(p=>p.appointmentId?[p.appointmentId]:[])}}}),
   prisma.store.findUniqueOrThrow({where:{id:storeId},select:{name:true}}),
   prisma.staff.findMany({where:{storeId},select:{id:true,userId:true,displayName:true,user:{select:{role:true}}}}),
   beautyCardSaleAttribution(tx,storeId),
  ]);
  const saleIds=[...new Set(receipts.filter(p=>p.kind==='SALE').map(p=>p.id))];
  const [revisions,allocations,priorRefunds]=await Promise.all([
   beautyTransactionRevisions(tx,storeId,saleIds),beautySaleAllocations(tx,storeId,saleIds),
   payments.some(p=>p.kind==='REFUND')?tx.beautyPayment.findMany({where:{storeId,kind:'REFUND',originalPaymentId:{in:saleIds},createdAt:{lte:range.lte},...(await beautyPaymentVisibility(tx,storeId))},orderBy:[{createdAt:'asc'},{id:'asc'}]}):Promise.resolve([]),
  ]);
  const receiptAllocations=beautyReceiptAllocations([...receipts,...priorRefunds],allocations);

  const ids=[...new Set([...cards.map(c=>c.customerId),...appointments.flatMap(b=>b.customerId?[b.customerId]:[])])];
  const customers=access.customers?await prisma.customer.findMany({where:{storeId,id:{in:ids}},select:{id:true,name:true,phone:true}}):[];
  const first=await tx.$queryRaw<{id:string}[]>`SELECT DISTINCT ON (COALESCE(c."customerId",b."customerId")) p.id FROM "BeautyPayment" p LEFT JOIN "BeautyCard" c ON c.id=p."cardId" AND c."storeId"=p."storeId" LEFT JOIN "BeautyAppointment" b ON b.id=p."appointmentId" AND b."storeId"=p."storeId" WHERE p."storeId"=${storeId} AND p.kind='SALE' AND NOT EXISTS (SELECT 1 FROM "BeautyTransactionRevision" m WHERE m."storeId"=p."storeId" AND m."transactionId"=p.id AND m."voidedAt" IS NOT NULL) AND COALESCE(c."customerId",b."customerId") IS NOT NULL ORDER BY COALESCE(c."customerId",b."customerId"),p."createdAt",p.id`;
  const firstIds=new Set(first.map(p=>p.id));
  const rows:ModuleRevenueRow[]=payments.map(payment=>{
   const original=payment.originalPaymentId?originals.find(p=>p.id===payment.originalPaymentId):payment;
   const card=cards.find(c=>c.id===(original?.cardId??payment.cardId)),booking=appointments.find(b=>b.id===(original?.appointmentId??payment.appointmentId));
   const customerId=card?.customerId??booking?.customerId??null,person=customers.find(c=>c.id===customerId),actor=staff.find(s=>s.userId===payment.actorUserId);
   const metadata=revisions.get(original?.id??payment.id);
   const frozen=allocations.get(original?.id??payment.id);
   const ownerId=metadata?metadata.revenueStaffId:frozen?frozen.revenueStaffId:card&&attribution.has(card.id)?attribution.get(card.id):null;
   const owner=staff.find(s=>s.id===ownerId);
   const unit=card?'SESSION':booking?.isTrial?'TRIAL':'SINGLE';
   return {id:payment.id,transactionNo:null,transactionDate:toLocalDateStr(payment.createdAt),storeName:store.name,customerName:access.customers?person?.name??booking?.personName??'顧客資料待核對':'顧客',customerPhone:access.customers?person?.phone??booking?.personPhone??'':'',customerId,coachName:owner?.displayName??(ownerId?'人員資料待核對':null),coachRole:owner?.user.role??null,staffId:ownerId??null,planName:card?.name??booking?.serviceName??'交易資料待核對',planType:unit,unit,grossAmount:payment.amount,discountAmount:0,netAmount:payment.amount,paymentMethod:payment.method==='BANK_TRANSFER'?'TRANSFER':payment.method==='CARD'?'CREDIT_CARD':payment.method,paymentSplits:[],status:payment.kind==='REFUND'?'REFUNDED':'SUCCESS',isFirstPurchase:payment.kind==='SALE'&&firstIds.has(payment.id),note:access.customers?metadata?.note??payment.note:null,createdByName:actor?.displayName??null,createdAt:payment.createdAt.toISOString(),refund:payment.kind==='REFUND',saleAllocation:beautySaleShare(payment.amount,receiptAllocations.get(payment.id),!!ownerId)};
  });
  const report=moduleRevenueReport(rows,storeId,store.name,filters);
  return {...report,data:report.data.map(row=>access.customers?row:{...row,customerId:null,note:null})};
 },{isolationLevel:'RepeatableRead',timeout:15000});
}
