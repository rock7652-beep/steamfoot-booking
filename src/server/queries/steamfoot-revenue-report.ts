import 'server-only';
import {z} from 'zod';
import {prisma} from '@/lib/db';
import {dayRange,parseTaiwanDateToDbDate,parseTaipeiDateTime,toLocalDateStr} from '@/lib/date-utils';
import {REVENUE_NET_TYPES,REVENUE_VALID_STATUS} from '@/lib/booking-constants';
import {getManagerReadFilter} from '@/lib/manager-visibility';
import {requireSteamfootStore} from '@/lib/industry-module-server';
import {requireInventoryFinanceAccess} from '@/server/inventory-finance-access';
import {isRetailCashbookCategory} from '@/lib/cashbook-entry-kind';
import {moduleRevenueReport,type ModuleRevenueRow} from '@/lib/module-revenue-report';
import type {ReportFilters} from '@/lib/report-queries';
import type {UserRole} from '@prisma/client';
import {AppError} from '@/lib/errors';
import {cashbookRevenueWhere} from './cashbook-revenue';
export type SteamfootReceiptMeta={receiptSource:'SYSTEM'|'CASHBOOK'|'INVENTORY';receiptKind:'INCOME'|'REFUND'|'CORRECTION';sourceId:string;sourceCreatedAt:string};
/** Trusted report/export callers authorize the store and operation; this applies their read scope. */
export async function getSteamfootRevenueReport(storeId:string,filters:ReportFilters,access:{customers:boolean;reader:{role:UserRole;staffId:string|null}}){
 if(!z.object({startDate:z.string().date(),endDate:z.string().date()}).safeParse(filters).success||filters.startDate>filters.endDate)throw new AppError('VALIDATION','日期範圍無效');
 await requireSteamfootStore(storeId);await requireInventoryFinanceAccess(storeId,access.reader);
 return prisma.$transaction(async tx=>{
  const [transactions,cash,store]=await Promise.all([
   tx.transaction.findMany({where:{AND:[filters.storeFilter,{storeId},getManagerReadFilter(access.reader.role,access.reader.staffId,'revenueStaffId',storeId)],status:REVENUE_VALID_STATUS,transactionType:{in:[...REVENUE_NET_TYPES]},createdAt:{gte:dayRange(filters.startDate).start,lte:dayRange(filters.endDate).end}},include:{customer:access.customers?{select:{name:true,phone:true}}:false,revenueStaff:{select:{displayName:true,user:{select:{role:true}}}},soldByStaff:{select:{displayName:true}},paymentSplits:true}}),
   tx.cashbookEntry.findMany({where:{AND:[filters.storeFilter,{storeId},getManagerReadFilter(access.reader.role,access.reader.staffId,'staffId',storeId),cashbookRevenueWhere],entryDate:{gte:parseTaiwanDateToDbDate(filters.startDate),lte:parseTaiwanDateToDbDate(filters.endDate)}},include:{customer:access.customers?{select:{name:true,phone:true}}:false,staff:{select:{displayName:true,user:{select:{role:true}}}},createdBy:{select:{name:true}}}}),
   tx.store.findUniqueOrThrow({where:{id:storeId},select:{name:true}}),
  ]);
  const meta=new Map<string,SteamfootReceiptMeta>();
  const rows:ModuleRevenueRow[]=transactions.map(t=>{
   const amount=Number(t.amount),refund=t.transactionType==='REFUND';
   const unit=({TRIAL_PURCHASE:'TRIAL',SINGLE_PURCHASE:'SINGLE',PACKAGE_PURCHASE:'PACKAGE',SUPPLEMENT:'SUPPLEMENT',REFUND:t.planType??'OTHER'} as Record<string,string>)[t.transactionType];
   meta.set(t.id,{receiptSource:'SYSTEM',receiptKind:refund?'REFUND':'INCOME',sourceId:t.id,sourceCreatedAt:t.createdAt.toISOString()});
   return {id:t.id,transactionNo:t.transactionNo,transactionDate:toLocalDateStr(t.createdAt),storeName:store.name,customerName:access.customers?t.customer?.name??'未建檔同行者':'顧客',customerPhone:access.customers?t.customer?.phone??'':'',customerId:access.customers?t.customerId:null,coachName:t.coachNameSnapshot??t.revenueStaff?.displayName??null,coachRole:t.coachRoleSnapshot??t.revenueStaff?.user.role??null,staffId:t.revenueStaffId,planName:t.planNameSnapshot??unit,planType:unit,unit,grossAmount:Number(t.originalAmount??t.grossAmount??t.amount),discountAmount:Number(t.discountAmount??0),netAmount:amount,paymentMethod:t.paymentMethod,paymentSplits:t.paymentSplits.flatMap(p=>p.paymentMethod==='UNPAID'?[]:[{paymentMethod:p.paymentMethod,amount:Number(p.amount)}]),status:refund?'REFUNDED':'SUCCESS',refund,isFirstPurchase:t.isFirstPurchase,note:access.customers?t.note:null,createdByName:t.soldByStaff?.displayName??null,createdAt:t.createdAt.toISOString()};
  });
  for(const c of cash){
   const id=`cashbook:${c.id}`,date=c.entryDate.toISOString().slice(0,10),refund=c.type==='EXPENSE';
   const receiptSource=c.id.startsWith('inventory:')?'INVENTORY':'CASHBOOK',receiptKind=refund?(['銷貨退款','工單退款'].includes(c.category??'')?'REFUND':'CORRECTION'):'INCOME';
   meta.set(id,{receiptSource,receiptKind,sourceId:c.id,sourceCreatedAt:c.createdAt.toISOString()});
   const unit=isRetailCashbookCategory(c.category)||c.category==='銷貨退款'?'RETAIL':'OTHER',amount=Number(c.amount)*(refund?-1:1);
   rows.push({id,transactionNo:c.id,transactionDate:date,storeName:store.name,customerName:access.customers?c.customer?.name??'未關聯顧客':'顧客',customerPhone:access.customers?c.customer?.phone??'':'',customerId:access.customers?c.customerId:null,coachName:c.staff?.displayName??null,coachRole:c.staff?.user.role??null,staffId:c.staffId,planName:c.category??'其他收入',planType:unit,unit,grossAmount:amount,discountAmount:0,netAmount:amount,paymentMethod:c.paymentMethod,paymentSplits:[],status:receiptKind==='CORRECTION'?'REVERSED':refund?'REFUNDED':'SUCCESS',refund,isFirstPurchase:false,note:access.customers?c.note:null,createdByName:c.createdBy.name,createdAt:parseTaipeiDateTime(date,'00:00')!.toISOString()});
  }
  const report=moduleRevenueReport(rows,storeId,store.name,filters);
  const sum=(unit:string)=>report.data.filter(r=>!r.refund&&r.unit===unit).reduce((n,r)=>n+r.netAmount,0);
  return {...report,summary:report.summary.map(s=>({...s,trialRevenue:sum('TRIAL'),packageRevenue:sum('PACKAGE'),singleRevenue:sum('SINGLE'),otherRevenue:sum('SUPPLEMENT')+sum('RETAIL')+sum('OTHER'),supplementRevenue:sum('SUPPLEMENT'),retailRevenue:sum('RETAIL'),otherIncomeRevenue:sum('OTHER')})),data:report.data.map(r=>({...r,...meta.get(r.id)!})),classification:{trial:sum('TRIAL'),single:sum('SINGLE'),plan:sum('PACKAGE'),supplement:sum('SUPPLEMENT'),retail:sum('RETAIL'),other:sum('OTHER')}};
 },{isolationLevel:'RepeatableRead',timeout:15000});
}
