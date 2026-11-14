"use server";

import {BookingType,TransactionType} from "@prisma/client";
import {courseHistoryRange,courseHistoryItem} from "@/lib/course-history-range";
import { bookingDateToday, getNowTaipeiHHmm } from "@/lib/date-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getStoreFilter } from "@/lib/manager-visibility";
import { getActiveStoreForRead } from "@/lib/store";
import { resolveStoreViewContextFromCookie, storeIdForViewContext, userForViewContext } from "@/lib/store-view-context-server";
import { AppError, handleActionError } from "@/lib/errors";
import { formatPaymentMethod, formatTransactionType, formatBookingType } from "@/lib/data-export-labels";
import type { SessionRow } from "@/components/wallet-session-detail";
import type { ActionResult } from "@/types";
import type {WalletSessionCorrectionRecord} from '@/lib/wallet-session-correction';

export type CustomerPanelRecord = { id: string; date: Date; label: string; status: string; amount?: number; payment?: string; note?: string | null };
export type CustomerPanelRecords = { rows: CustomerPanelRecord[]; hasMore: boolean; page: number };

export async function getCustomerPanelRecords(customerId: string, kind: "bookings" | "consumption", page = 1, scope: "all" | "past" = "all", range:{from?:string;to?:string;item?:string}={}): Promise<ActionResult<CustomerPanelRecords>> {
  try {
    const user = await requirePermission("customer.read");
    if (kind !== "bookings" && kind !== "consumption") throw new AppError("VALIDATION", "紀錄種類不正確");
    await requirePermission(kind === "bookings" ? "booking.read" : "transaction.read");
    if (!Number.isSafeInteger(page) || page < 1) throw new AppError("VALIDATION", "頁數不正確");
    if (scope !== "all" && scope !== "past") throw new AppError("VALIDATION", "紀錄範圍不正確");
    const context = await resolveStoreViewContextFromCookie(user);
    const storeId = storeIdForViewContext(await getActiveStoreForRead(user), context);
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, ...getStoreFilter(userForViewContext(user, context), storeId), mergedIntoCustomerId: null },
      select: { id: true, storeId: true, user: {select: {status:true}} },
    });
    if (!customer || customer.user?.status === "SUSPENDED") throw new AppError("NOT_FOUND", "顧客不存在");
    const bounds=courseHistoryRange(range),item=courseHistoryItem(range);
    const dates={...(range.from?{gte:new Date(range.from+"T00:00:00Z")}:{ }),...(range.to?{lte:new Date(range.to+"T00:00:00Z")}:{ })};
    const where = { customerId: customer.id, storeId: customer.storeId };
    const take = 20;
    if (kind === "bookings") {
      const today = bookingDateToday();
      const bookingTypes=Object.values(BookingType).filter(type=>formatBookingType(type).toLocaleLowerCase('zh-TW').includes(item?.toLocaleLowerCase('zh-TW')??''));
      const itemFilter=item?{OR:[{customerPlanWallet:{plan:{name:{contains:item,mode:"insensitive" as const}}}},...(bookingTypes.length?[{bookingType:{in:bookingTypes}}]:[])]}:undefined;
      const records = await prisma.booking.findMany({ where: {...where, ...(Object.keys(dates).length?{bookingDate:dates}:{}),...(itemFilter?{AND:[itemFilter]}:{}), ...(scope === "past" ? { OR: [{ bookingDate: {lt: today} }, { bookingDate: today, slotTime: {lt: getNowTaipeiHHmm()} }] } : {})}, skip: (page - 1) * take, take: take + 1,
        orderBy: [{bookingDate:"desc"}, {slotTime:"desc"}, {id:"desc"}],
        select: {id:true, bookingDate:true, slotTime:true, bookingType:true, bookingStatus:true, people:true, notes:true} });
      return {success:true, data: {page, hasMore:records.length > take, rows: records.slice(0,take).map(b => ({id:b.id, date:b.bookingDate, label:`${b.slotTime} · ${formatBookingType(b.bookingType)} · ${b.people} 人`, status:b.bookingStatus, note:b.notes}))}};
    }
    // Merge the two ordered sources before slicing so page boundaries never lose one source.
    const limit = page * take + 1;
    const transactionTypes=Object.values(TransactionType).filter(type=>formatTransactionType(type).includes(item??''));
    const transactionItem=item?{OR:[{planNameSnapshot:{contains:item,mode:"insensitive" as const}},...(transactionTypes.length?[{planNameSnapshot:null,transactionType:{in:transactionTypes}},{planNameSnapshot:"",transactionType:{in:transactionTypes}}]:[])]}:{};
    const cashbookItem=item?{OR:[{category:{contains:item,mode:"insensitive" as const}},...('現場消費'.includes(item)?[{category:null},{category:""}]:[])]}:{};
    const [transactions, cashbook] = await Promise.all([
      prisma.transaction.findMany({where:{...where,createdAt:bounds,...transactionItem}, take:limit, orderBy:[{createdAt:"desc"},{id:"desc"}], select:{id:true,createdAt:true,transactionType:true,planNameSnapshot:true,amount:true,paymentMethod:true,paymentStatus:true,note:true}}),
      prisma.cashbookEntry.findMany({where:{...where,type:"INCOME",entryDate:dates,...cashbookItem},take:limit,orderBy:[{entryDate:"desc"},{id:"desc"}],select:{id:true,entryDate:true,category:true,amount:true,paymentMethod:true,note:true}}),
    ]);
    const rows: CustomerPanelRecord[] = [
      ...transactions.map(t => ({id:`transaction:${t.id}`,date:t.createdAt,label:t.planNameSnapshot || formatTransactionType(t.transactionType),status:t.paymentStatus === "PENDING" ? "待收款" : "已收款",amount:Number(t.amount),payment:formatPaymentMethod(t.paymentMethod),note:t.note})),
      ...cashbook.map(t => ({id:`cashbook:${t.id}`,date:t.entryDate,label:t.category?.replace(/^零售-/,"") || "現場消費",status:"已收款",amount:Number(t.amount),payment:formatPaymentMethod(t.paymentMethod),note:t.note})),
    ].sort((a,b) => b.date.getTime() - a.date.getTime() || b.id.localeCompare(a.id));
    return {success:true,data:{page,rows:rows.slice((page-1)*take,page*take),hasMore:rows.length > page*take}};
  } catch (error) { return handleActionError(error); }
}

export async function getCustomerPanelWalletSessions(customerId:string,walletId:string):Promise<ActionResult<SessionRow[]>> {
  try {
    const user=await requirePermission("customer.read");
    await requirePermission("wallet.read");
    const context=await resolveStoreViewContextFromCookie(user);
    const storeId=storeIdForViewContext(await getActiveStoreForRead(user),context);
    const customer=await prisma.customer.findFirst({where:{id:customerId,...getStoreFilter(userForViewContext(user,context),storeId),mergedIntoCustomerId:null},select:{id:true,storeId:true,user:{select:{status:true}}}});
    if(!customer || customer.user?.status === "SUSPENDED")throw new AppError("NOT_FOUND","顧客不存在");
    const wallet=await prisma.customerPlanWallet.findFirst({where:{id:walletId,customerId:customer.id,storeId:customer.storeId},select:{sessions:{orderBy:{sessionNo:"asc"},select:{id:true,sessionNo:true,status:true,updatedAt:true,reservedAt:true,completedAt:true,voidedAt:true,voidReason:true,booking:{select:{bookingDate:true,bookingStatus:true,slotTime:true}},voidedByStaff:{select:{displayName:true}}}}}});
    if(!wallet)throw new AppError("NOT_FOUND","方案不存在");
    const corrections=await prisma.auditLog.findMany({where:{storeId:customer.storeId,targetType:'WalletSession',targetId:{in:wallet.sessions.map(s=>s.id)},action:'WALLET_SESSION_CORRECTION'},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{targetId:true,afterJson:true}});
    return {success:true as const,data:wallet.sessions.map(session=>({...session,corrections:corrections.filter(row=>row.targetId===session.id).flatMap(row=>{const data=row.afterJson as {record?:WalletSessionCorrectionRecord}|null;return data?.record?[data.record]:[];})}))};
  }catch(error){return handleActionError(error);}
}
