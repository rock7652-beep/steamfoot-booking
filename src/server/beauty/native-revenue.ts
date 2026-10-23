import 'server-only';
import {Prisma} from '../../../generated/beauty-client';
import {beautyPrisma} from '@/lib/beauty-db';
import {prisma} from '@/lib/db';
import {beautyManager} from './access';
import {FEATURES} from '@/lib/feature-flags';
import {hasStoreFeature,requireStoreFeature} from '@/lib/feature-gate';
import {getCurrentUser} from '@/lib/session';
import {checkPermission} from '@/lib/permissions';
import {dayRange,formatTWTime} from '@/lib/date-utils';
import {planInput} from '@/lib/beauty/contracts';
import type {CourseRevenueRow,CourseRevenueSnapshot} from '@/app/(dashboard)/dashboard/revenue/_components/course-revenue-source';

async function authorize(){
 const a=await beautyManager('transaction.read');await requireStoreFeature(a.storeId,FEATURES.TRANSACTION_MANAGEMENT);
 const u=await getCurrentUser(),can=async(p:Parameters<typeof checkPermission>[2])=>!!u&&await checkPermission(u.role,u.staffId,p);
 const [customers,cards]=await Promise.all([can('customer.read').then(async enabled=>enabled&&await hasStoreFeature(a.storeId,FEATURES.CUSTOMER_MANAGEMENT)),can('wallet.read').then(async enabled=>enabled&&await hasStoreFeature(a.storeId,FEATURES.PLAN_MANAGEMENT))]);
 return {...a,customers,cards};
}
function history(storeId:string,from:string,to:string){const range={gte:dayRange(from).start,lte:dayRange(to).end};return Prisma.sql`
 WITH refunds AS (SELECT "originalPaymentId",-sum(amount)::int AS amount FROM "BeautyPayment" WHERE "storeId"=${storeId} AND kind='REFUND' GROUP BY "originalPaymentId"),
 history AS (
 SELECT p.id,'SALE'::text AS kind,p."createdAt",p."actorUserId" AS "confirmedBy",
 CASE WHEN COALESCE(r.amount,0)>0 AND r.amount>=p.amount THEN 'REFUNDED' ELSE 'CONFIRMED' END AS status
 FROM "BeautyPayment" p LEFT JOIN refunds r ON r."originalPaymentId"=p.id
 WHERE p."storeId"=${storeId} AND p.kind='SALE' AND p."createdAt">=${range.gte} AND p."createdAt"<=${range.lte}
 UNION ALL
 SELECT q.id,'REQUEST'::text AS kind,q."createdAt",NULL AS "confirmedBy",CASE WHEN q.status='PENDING' THEN 'PENDING' ELSE 'VOIDED' END AS status
 FROM "BeautyPurchase" q WHERE q."storeId"=${storeId} AND q.status<>'CONFIRMED' AND q."createdAt">=${range.gte} AND q."createdAt"<=${range.lte}
 )`;
}
async function totals(storeId:string,from:string,to:string){
 const rows=await beautyPrisma.beautyPayment.findMany({where:{storeId,createdAt:{gte:dayRange(from).start,lte:dayRange(to).end},kind:{in:['SALE','REFUND']}},select:{kind:true,cardId:true,amount:true}});
 const purchases=rows.filter(p=>p.kind==='SALE'&&p.cardId).reduce((n,p)=>n+p.amount,0),trial=rows.filter(p=>p.kind==='SALE'&&!p.cardId).reduce((n,p)=>n+p.amount,0),refunds=-rows.filter(p=>p.kind==='REFUND').reduce((n,p)=>n+p.amount,0),gross=purchases+trial;
 return {purchases,purchaseCount:rows.filter(p=>p.kind==='SALE'&&p.cardId).length,trial,refunds,voids:0,gross,net:gross-refunds};
}
export async function readBeautyRevenue(input:{from:string;to:string;status?:string;staff?:string;page:number}):Promise<CourseRevenueSnapshot>{
 const a=await authorize(),h=history(a.storeId,input.from,input.to);
 const condition=Prisma.sql`WHERE (${input.status??null}::text IS NULL OR status=${input.status??null}) AND (${input.staff??null}::text IS NULL OR "confirmedBy"=${input.staff??null})`;
 const [counts,pending,receiptTotals,staffRows]=await Promise.all([
  beautyPrisma.$queryRaw<Array<{count:number}>>(Prisma.sql`${h} SELECT count(*)::int AS count FROM history ${condition}`),
  beautyPrisma.$queryRaw<Array<{count:number}>>(Prisma.sql`${h} SELECT count(*)::int AS count FROM history WHERE status='PENDING'`),
  totals(a.storeId,input.from,input.to),
  prisma.staff.findMany({where:{storeId:a.storeId},select:{id:true,userId:true,displayName:true,status:true,user:{select:{role:true}}}}),
 ]);
 const count=counts[0]?.count??0,pages=Math.max(1,Math.ceil(count/30)),page=Math.min(pages,Math.max(1,input.page));
 const selected=await beautyPrisma.$queryRaw<Array<{id:string;kind:string;createdAt:Date;status:string;confirmedBy:string|null}>>(Prisma.sql`${h} SELECT * FROM history ${condition} ORDER BY "createdAt" DESC,id DESC LIMIT 30 OFFSET ${(page-1)*30}`);
 const [payments,requests]=await Promise.all([beautyPrisma.beautyPayment.findMany({where:{storeId:a.storeId,id:{in:selected.filter(s=>s.kind==='SALE').map(s=>s.id)}}}),beautyPrisma.beautyPurchase.findMany({where:{storeId:a.storeId,id:{in:selected.filter(s=>s.kind==='REQUEST').map(s=>s.id)}}})]);
 const [cards,appointments,refunds]=await Promise.all([
  beautyPrisma.beautyCard.findMany({where:{storeId:a.storeId,id:{in:payments.flatMap(p=>p.cardId?[p.cardId]:[])}}}),
  beautyPrisma.beautyAppointment.findMany({where:{storeId:a.storeId,id:{in:payments.flatMap(p=>p.appointmentId?[p.appointmentId]:[])}}}),
  beautyPrisma.beautyPayment.findMany({where:{storeId:a.storeId,kind:'REFUND',originalPaymentId:{in:payments.map(p=>p.id)}},orderBy:[{createdAt:'desc'},{id:'desc'}]}),
 ]);
 const [people,held]=await Promise.all([
  a.customers?prisma.customer.findMany({where:{storeId:a.storeId,id:{in:[...cards.map(c=>c.customerId),...requests.map(q=>q.customerId)]}},select:{id:true,name:true}}):Promise.resolve([]),
  a.cards?beautyPrisma.beautyAppointment.groupBy({by:['cardId'],where:{storeId:a.storeId,cardId:{in:cards.map(c=>c.id)},status:'RESERVED'},_count:{id:true}}):Promise.resolve([]),
 ]);
 const rows:CourseRevenueRow[]=selected.map(s=>{
  const sale=payments.find(p=>p.id===s.id),q=requests.find(q=>q.id===s.id),c=cards.find(c=>c.id===sale?.cardId),b=appointments.find(b=>b.id===sale?.appointmentId),plan=q?planInput.parse(q.snapshot):null;
  const customerId=c?.customerId??q?.customerId;
  const rs=refunds.filter(r=>r.originalPaymentId===s.id);
  return {id:s.id,createdAt:s.createdAt,date:formatTWTime(s.createdAt,{dateOnly:true}),confirmedBy:s.confirmedBy,status:s.status,name:c?.name??b?.serviceName??plan?.name??'交易資料待核對',customerName:a.customers?people.find(p=>p.id===customerId)?.name??b?.personName??'顧客資料待核對':'顧客',price:sale?.amount??plan?.price??0,listPrice:c?.listPrice??b?.price??plan?.price??null,paymentMethod:sale?.method??'BANK_TRANSFER',transferLastFour:q?.lastFour??sale?.note.match(/轉帳末四碼 (\d{4})/)?.[1]??null,transferLastFive:'',note:sale?.note??'',revenueStaffId:null,voidReason:null,points:a.cards?c?.sessions??plan?.sessions??0:0,unit:c||plan?'SESSION':'MONEY',remaining:a.cards?c?.remaining??null:null,reserved:a.cards?held.find(h=>h.cardId===c?.id)?._count.id??0:0,attended:0,usedQuota:0,expiresAt:a.cards&&c?formatTWTime(c.expiresAt,{dateOnly:true}):null,storeCostSnapshot:null,refunds:rs.map(r=>({amount:-r.amount,reason:r.note,date:formatTWTime(r.createdAt,{dateOnly:true}),method:r.method}))};
 });
 return {rows,count,page,pages,pendingCount:pending[0]?.count??0,receiptTotals,staffRows,confirmationActors:payments.map(p=>p.actorUserId)};
}
export async function readBeautyReceiptSummary(from:string,to:string){
 const a=await authorize();
 const [receiptTotals,rows]=await Promise.all([totals(a.storeId,from,to),beautyPrisma.beautyPayment.findMany({where:{storeId:a.storeId,createdAt:{gte:dayRange(from).start,lte:dayRange(to).end},kind:{in:['SALE','REFUND']}},orderBy:[{createdAt:'desc'},{id:'desc'}]})]);
 // The original summary is an actual receipt ledger, including refunds by their event dates.
 return {totals:receiptTotals,rows:rows.map(p=>({id:p.id,createdAt:p.createdAt.toISOString(),customerName:'—',planName:p.note,netAmount:p.amount}))};
}
