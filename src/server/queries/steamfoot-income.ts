import 'server-only';
import {z} from 'zod';
import {prisma} from '@/lib/db';
import {dayRange,parseTaiwanDateToDbDate} from '@/lib/date-utils';
import {readCashbookRevenue} from './cashbook-revenue';
import {requirePermission} from '@/lib/permissions';
import {getActiveStoreForRead} from '@/lib/store';
import {requireSteamfootStore} from '@/lib/industry-module-server';
import {getManagerReadFilter} from '@/lib/manager-visibility';
import {resolveStoreViewContextFromCookie,storeIdForViewContext,userForViewContext} from '@/lib/store-view-context-server';
import {requireInventoryFinanceAccess} from '@/server/inventory-finance-access';
import {REVENUE_NET_TYPES,REVENUE_VALID_STATUS} from '@/lib/booking-constants';
import {AppError} from '@/lib/errors';

/** Same event dates, valid transactions and cashbook income as the ledger summary. */
export async function readSteamfootIncome(storeId:string,from:string,to:string){
 const dates=z.object({from:z.string().date(),to:z.string().date()}).refine(d=>d.from<=d.to).parse({from,to});
 const user=await requirePermission('report.read');
 const view=await resolveStoreViewContextFromCookie(user);
 if(storeIdForViewContext(await getActiveStoreForRead(user),view)!==storeId)throw new AppError('FORBIDDEN','店家已切換，請重新開啟收入分類');
 await requireSteamfootStore(storeId);
 const reader=userForViewContext(user,view);
 await requireInventoryFinanceAccess(storeId,reader);
 const range={gte:dayRange(dates.from).start,lte:dayRange(dates.to).end};
 return prisma.$transaction(async tx=>{
  const [transactions,cash]=await Promise.all([
   tx.transaction.groupBy({by:['transactionType'],where:{...getManagerReadFilter(reader.role,reader.staffId,'revenueStaffId',storeId),transactionType:{in:[...REVENUE_NET_TYPES]},status:REVENUE_VALID_STATUS,createdAt:range},_sum:{amount:true}}),
   readCashbookRevenue(tx,{...getManagerReadFilter(reader.role,reader.staffId,'staffId',storeId),entryDate:{gte:parseTaiwanDateToDbDate(dates.from),lte:parseTaiwanDateToDbDate(dates.to)}}),
  ]);
  const amounts=new Map(transactions.map(t=>[t.transactionType,Number(t._sum.amount??0)]));
  const trial=amounts.get('TRIAL_PURCHASE')??0,single=amounts.get('SINGLE_PURCHASE')??0,plan=amounts.get('PACKAGE_PURCHASE')??0,other=amounts.get('SUPPLEMENT')??0;
  const {retail,otherIncome,inventoryRefund,inventoryReversal,cashbookRefund}=cash;
  const manual=retail+otherIncome,systemRefund=-(amounts.get('REFUND')??0),refund=systemRefund+cashbookRefund,gross=trial+single+plan+other+manual;
  return {trial,single,plan,other,retail,otherIncome,manual,gross,systemRefund,inventoryRefund,inventoryReversal,refund,net:gross-refund};
 },{isolationLevel:'RepeatableRead',timeout:15000});
}
