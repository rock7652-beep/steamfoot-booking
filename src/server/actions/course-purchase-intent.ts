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
// Preview diagnostics deliberately contain only phase durations, never input or identity.
function intentTimer(operation: string) {
  const enabled = process.env.VERCEL_ENV === "preview" && process.env.COURSE_PURCHASE_QA_STORE_SCOPE === "1";
  const start = performance.now();
  const phases: Record<string, number> = {};
  return {
    async measure<T>(name: string, work: () => Promise<T>): Promise<T> {
      if (!enabled) return work();
      const at = performance.now();
      try { return await work(); } finally { phases[name] = Math.round(performance.now() - at); }
    },
    finish() { if (enabled) console.info("[course-intent-perf]", { operation, durationMs: Math.round(performance.now() - start), phases }); },
  };
}
function assertEnabled() {
  if (process.env.COURSE_PURCHASE_INTENTS_ENABLED !== "1") throw new AppError("FORBIDDEN", "購買核對功能尚未啟用");
}
async function writeActor() {
  const [wallet, financial, customer] = await Promise.all([courseManager("wallet.create"), courseManager("transaction.create"), courseManager("customer.read")]);
  if ([financial, customer].some(a => a.storeId !== wallet.storeId || a.user.id !== wallet.user.id)) throw new AppError("FORBIDDEN", "店家範圍不一致");
  if (!coursePurchaseIntentsEnabled(wallet.storeId)) throw new AppError("FORBIDDEN", "購買核對功能尚未啟用");
  return wallet;
}
async function readActor(timer?: ReturnType<typeof intentTimer>) {
  // A staff member who can make this purchase must also be able to recover it,
  // even if they cannot browse the store's transaction history. Return only
  // the minimal outcome after rechecking both purchase grants and visibility.
  const options = (permission: string) => timer ? { timing: { measure: <T>(name: string, work: () => Promise<T>) => timer.measure(`${permission}.${name}`, work) } } : undefined;
  const [wallet, financial, customer] = await Promise.all([courseManagerRead("wallet.create", options("wallet")), courseManagerRead("transaction.create", options("transaction")), courseManagerRead("customer.read", options("customerRead"))]);
  if ([financial,customer].some(a => a.storeId !== wallet.storeId || a.user.id !== wallet.user.id)) throw new AppError("FORBIDDEN", "店家範圍不一致");
  if (!coursePurchaseIntentsEnabled(customer.storeId)) throw new AppError("FORBIDDEN", "購買核對功能尚未啟用");
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
    const timer = intentTimer("prepare");
    try {
      assertEnabled();
      const data = parseCoursePurchaseIntentInput(input);
      const actor = await timer.measure("authorization", writeActor);
      if (data.discountValue > 0 || data.musicDiscountTeacherFee || (data.musicManualBonus ?? 0) > 0) {
        const extra = await courseManager("transaction.discount");
        if (extra.storeId !== actor.storeId || extra.user.id !== actor.user.id) throw new AppError("FORBIDDEN", "店家範圍不一致");
      }
      await timer.measure("customer", () => requireVisibleCustomer(actor, data.customerId));
      const plan = await timer.measure("plan", () => coursePrisma.coursePointPlan.findFirst({where:{id:data.planId,storeId:actor.storeId,isActive:true},select:{termSessionIds:true}}));
      if (!plan) throw new AppError("VALIDATION", "請選擇本店有效方案");
      if (plan.termSessionIds.length) {
        const extra = await courseManager("booking.create");
        if (extra.storeId !== actor.storeId || extra.user.id !== actor.user.id) throw new AppError("FORBIDDEN", "店家範圍不一致");
      }
      const result = await timer.measure("transaction", () => coursePrisma.$transaction(async tx => {
        await timer.measure("storeLock", () => lockCourseStore(tx, actor.storeId));
        await timer.measure("lockedCustomer", () => requireVisibleCustomerLocked(tx, actor, data.customerId));
        return timer.measure("register", () => prepareCourseIntent(tx, {storeId:actor.storeId,userId:actor.user.id}, data));
      }, {timeout:15000}));
      return {success:true as const,data:result};
    } catch (error) { return handleActionError(error); } finally { timer.finish(); }
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
  const timer = intentTimer("pending");
  try {
    assertEnabled(); const data = customerInput.parse(input), actor = await timer.measure("authorization", () => readActor(timer));
    await timer.measure("customer", () => requireVisibleCustomer(actor,data.customerId));
    return {success:true as const,data:await timer.measure("pendingLookup", () => readPendingCourseIntent(coursePrisma,actor.storeId,data.customerId))};
  } catch (error) { return handleActionError(error); } finally { timer.finish(); }
}
