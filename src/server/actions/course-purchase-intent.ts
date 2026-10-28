"use server";
import { z } from "zod";
import { coursePurchaseIntentsEnabled } from "@/lib/course-purchase-intent-flag";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { AppError, handleActionError } from "@/lib/errors";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { courseManager, courseManagerRead } from "@/server/services/course-access";
import { withCourseCheckoutRequest } from "@/server/services/music-checkout-request";
import { lockCourseStore } from "@/server/services/course-store-lock";
import { parseCoursePurchaseIntentInput } from "@/server/services/course-purchase-intent-input";
import { prepareCourseIntent, cancelCourseIntent, acknowledgeCourseIntent, readCourseIntent, readPendingCourseIntent } from "@/server/services/course-purchase-intent";
import type { Prisma } from "../../../generated/course-client";

const customerInput = z.object({ customerId: z.string().min(1).max(100) });
const keyInput = customerInput.extend({ requestKey: z.string().uuid() });
function assertEnabled() {
  if (!coursePurchaseIntentsEnabled()) throw new AppError("FORBIDDEN", "購買核對功能尚未啟用");
}
async function writeActor() {
  const [wallet, financial, customer] = await Promise.all([courseManager("wallet.create"), courseManager("transaction.create"), courseManager("customer.read")]);
  if ([financial, customer].some(a => a.storeId !== wallet.storeId || a.user.id !== wallet.user.id)) throw new AppError("FORBIDDEN", "店家範圍不一致");
  return wallet;
}
async function readActor() {
  // A staff member who can make this purchase must also be able to recover it,
  // even if they cannot browse the store's transaction history. Return only
  // the minimal outcome after rechecking both purchase grants and visibility.
  const [wallet, financial, customer] = await Promise.all([courseManagerRead("wallet.create"), courseManagerRead("transaction.create"), courseManagerRead("customer.read")]);
  if ([financial,customer].some(a => a.storeId !== wallet.storeId || a.user.id !== wallet.user.id)) throw new AppError("FORBIDDEN", "店家範圍不一致");
  return customer;
}
async function requireVisibleCustomer(actor: { user: Awaited<ReturnType<typeof courseManager>>["user"]; storeId: string }, customerId: string) {
  const found = await prisma.customer.findFirst({where:{ ...getManagerCustomerWhere(actor.user.role,actor.user.staffId,actor.storeId), id:customerId, storeId:actor.storeId, mergedIntoCustomerId:null },select:{id:true}});
  if (!found) throw new AppError("FORBIDDEN", "無法核對此學員的購買");
}
async function requireVisibleCustomerLocked(tx: Prisma.TransactionClient, actor: { user: Awaited<ReturnType<typeof courseManager>>["user"]; storeId: string }, customerId: string) {
  const where = getManagerCustomerWhere(actor.user.role,actor.user.staffId,actor.storeId);
  const assigned = typeof where.assignedStaffId === "string" ? where.assignedStaffId : null;
  const found = await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Customer" WHERE id=${customerId} AND "storeId"=${actor.storeId} AND "mergedIntoCustomerId" IS NULL AND (${assigned}::text IS NULL OR "assignedStaffId"=${assigned})`;
  if (!found.length) throw new AppError("FORBIDDEN", "無法核對此學員的購買");
}

export async function prepareCoursePurchaseIntent(input: unknown) {
  return withCourseCheckoutRequest(async () => {
    try {
      assertEnabled();
      const data = parseCoursePurchaseIntentInput(input);
      const actor = await writeActor();
      if (data.discountValue > 0 || data.musicDiscountTeacherFee || (data.musicManualBonus ?? 0) > 0) {
        const extra = await courseManager("transaction.discount");
        if (extra.storeId !== actor.storeId || extra.user.id !== actor.user.id) throw new AppError("FORBIDDEN", "店家範圍不一致");
      }
      await requireVisibleCustomer(actor, data.customerId);
      const plan = await coursePrisma.coursePointPlan.findFirst({where:{id:data.planId,storeId:actor.storeId,isActive:true},select:{termSessionIds:true}});
      if (!plan) throw new AppError("VALIDATION", "請選擇本店有效方案");
      if (plan.termSessionIds.length) {
        const extra = await courseManager("booking.create");
        if (extra.storeId !== actor.storeId || extra.user.id !== actor.user.id) throw new AppError("FORBIDDEN", "店家範圍不一致");
      }
      const result = await coursePrisma.$transaction(async tx => {
        await lockCourseStore(tx, actor.storeId);
        await requireVisibleCustomerLocked(tx, actor, data.customerId);
        return prepareCourseIntent(tx, {storeId:actor.storeId,userId:actor.user.id}, data);
      }, {timeout:15000});
      return {success:true as const,data:result};
    } catch (error) { return handleActionError(error); }
  });
}
export async function cancelCoursePurchaseIntent(input: unknown) {
  return withCourseCheckoutRequest(async () => {
    try {
      assertEnabled(); const data = keyInput.parse(input), actor = await writeActor();
      await requireVisibleCustomer(actor, data.customerId);
      const result = await coursePrisma.$transaction(async tx => {
        await lockCourseStore(tx, actor.storeId);
        await requireVisibleCustomerLocked(tx, actor, data.customerId);
        return cancelCourseIntent(tx,{storeId:actor.storeId,userId:actor.user.id},data.customerId,data.requestKey);
      }, {timeout:15000});
      return {success:true as const,data:result};
    } catch (error) { return handleActionError(error); }
  });
}
export async function getCoursePurchaseIntent(input: unknown) {
  try {
    assertEnabled(); const data = keyInput.parse(input), actor = await readActor();
    await requireVisibleCustomer(actor,data.customerId);
    return {success:true as const,data:await readCourseIntent(coursePrisma,actor.storeId,data.customerId,data.requestKey)};
  } catch (error) { return handleActionError(error); }
}
export async function acknowledgeCoursePurchaseIntent(input: unknown) {
  return withCourseCheckoutRequest(async () => {
    try {
      assertEnabled(); const data = keyInput.parse(input), actor = await writeActor();
      await requireVisibleCustomer(actor,data.customerId);
      const result = await coursePrisma.$transaction(async tx => {
        await lockCourseStore(tx, actor.storeId);
        await requireVisibleCustomerLocked(tx, actor, data.customerId);
        return acknowledgeCourseIntent(tx,{storeId:actor.storeId,userId:actor.user.id},data.customerId,data.requestKey);
      }, {timeout:15000});
      return {success:true as const,data:result};
    } catch (error) { return handleActionError(error); }
  });
}
export async function getPendingCoursePurchaseIntent(input: unknown) {
  try {
    assertEnabled(); const data = customerInput.parse(input), actor = await readActor();
    await requireVisibleCustomer(actor,data.customerId);
    return {success:true as const,data:await readPendingCourseIntent(coursePrisma,actor.storeId,data.customerId)};
  } catch (error) { return handleActionError(error); }
}
