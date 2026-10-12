"use server";
import { prisma } from "@/lib/db";
import { checkPermission, requirePermission } from "@/lib/permissions";
import { getStoreFilter } from "@/lib/manager-visibility";
import { getActiveStoreForRead } from "@/lib/store";
import { resolveStoreViewContextFromCookie, storeIdForViewContext, userForViewContext } from "@/lib/store-view-context-server";
import { AppError, handleActionError } from "@/lib/errors";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { getLatestNativeHealthRecord } from "@/lib/native-health-service";
import { getNowTaipeiHHmm } from "@/lib/date-utils";
import { todayRange } from "@/lib/date-utils";
import { PENDING_STATUSES } from "@/lib/booking-constants";
import type { HealthRecord } from "@/lib/health-service";
import type { ActionResult } from "@/types";

export type CustomerPanelSummary = { next: {date:Date; time:string} | null; pending: {id:string;walletId:string|null;label:string;amount:number;method:string}[]; canConfirm:boolean; healthEnabled:boolean; health:HealthRecord|null };
export async function getCustomerPanelSummary(customerId:string):Promise<ActionResult<CustomerPanelSummary>> {
  try {
    const user=await requirePermission("customer.read");
    const context=await resolveStoreViewContextFromCookie(user);
    const storeId=storeIdForViewContext(await getActiveStoreForRead(user),context);
    const readUser=userForViewContext(user,context);
    const customer=await prisma.customer.findFirst({where:{id:customerId,...getStoreFilter(readUser,storeId),mergedIntoCustomerId:null},select:{id:true,storeId:true,user:{select:{status:true}}}});
    if(!customer || customer.user?.status === "SUSPENDED")throw new AppError("NOT_FOUND","顧客不存在");
    const [canReadBookings,canReadPayments,canConfirm,healthEnabled]=await Promise.all([
      checkPermission(readUser.role,readUser.staffId,"booking.read"),checkPermission(readUser.role,readUser.staffId,"transaction.read"),
      checkPermission(readUser.role,readUser.staffId,"transaction.create"),hasStoreFeature(customer.storeId,FEATURES.AI_HEALTH_SUMMARY),
    ]);
    const where={customerId:customer.id,storeId:customer.storeId};
    const [next,pending,health]=await Promise.all([
      canReadBookings ? prisma.booking.findFirst({where:{...where,OR:[{bookingDate:{gt:todayRange().end}},{bookingDate:{gte:todayRange().start,lte:todayRange().end},slotTime:{gte:getNowTaipeiHHmm()}}],bookingStatus:{in:[...PENDING_STATUSES]}},orderBy:[{bookingDate:"asc"},{slotTime:"asc"}],select:{bookingDate:true,slotTime:true}}) : null,
      canReadPayments ? prisma.transaction.findMany({where:{...where,paymentStatus:"PENDING",status:"SUCCESS"},orderBy:{createdAt:"desc"},select:{id:true,customerPlanWalletId:true,planNameSnapshot:true,amount:true,paymentMethod:true}}) : [],
      healthEnabled ? getLatestNativeHealthRecord(customer.id,customer.storeId) : null,
    ]);
    return {success:true,data:{next:next ? {date:next.bookingDate,time:next.slotTime} : null,pending:pending.map(t=>({id:t.id,walletId:t.customerPlanWalletId,label:t.planNameSnapshot || "待收款",amount:Number(t.amount),method:t.paymentMethod})),canConfirm:!context?.isViewMode && canConfirm,healthEnabled,health}};
  }catch(error){return handleActionError(error);}
}
