"use server";

import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { requireWritablePermission } from "@/lib/permissions";
import { currentStoreId } from "@/lib/store";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { assertCustomerInOperationStore, assertSameStore } from "@/lib/store-consistency";
import { AppError, handleActionError } from "@/lib/errors";
import type { ActionResult } from "@/types";
import {
  generateWeeklyDateStrings,
  parseTaiwanDateToDbDate,
  toLocalDateStr,
} from "@/lib/date-utils";
import { createRecurringBookingsSchema } from "@/lib/validators/booking";
import { resolveBookableUntilDate } from "@/lib/shop-config";
import {
  applySlotOverrides,
  buildBusinessHoursMap,
  buildSpecialDayMap,
  resolveDayRule,
} from "@/lib/business-hours-resolver";
import { PENDING_STATUSES } from "@/lib/booking-constants";
import { snapshotRevenueStaffForBooking } from "./booking-helpers";
import { acquireBookingSlotLocks, bookingSlotTimeVariants } from "@/server/services/booking-slot-lock";
import { allocateSessionsFefo } from "@/server/services/wallet-session";
import { buildBookingRecurringPayloadHash } from "@/server/services/booking-submission-payload";
import {
  claimBookingSubmission,
  finalizeBookingSubmissionFinalFailure,
  finalizeBookingSubmissionRetryableFailure,
  finalizeBookingSubmissionSuccess,
  type BookingIdempotencyEnvelope,
} from "@/server/services/booking-submission";
import {
  RecurringBookingEligibilityError,
  type RecurringBookingEligibilityCode,
} from "@/server/services/recurring-booking-errors";
import { revalidateBookings } from "@/lib/revalidation";
import { requireCustomerBookingEligibility } from "@/lib/customer-booking-eligibility";
import { sendRecurringBookingConfirmation } from "@/server/services/recurring-booking-confirmation";

// Next.js "use server" modules may only export async functions. Keep this
// implementation limit module-local so createRecurringBookings() remains
// callable from the customer Client Component.
const WEEKLY_RECURRENCE_SYSTEM_MAX_WEEKS = 12;

type Input = z.infer<typeof createRecurringBookingsSchema>;
type Result = { recurrenceGroupId: string; bookingIds: string[] };

function eligibility(
  code: RecurringBookingEligibilityCode,
  message: string,
  occurrenceIndex?: number,
  bookingDate?: string,
): never {
  throw new RecurringBookingEligibilityError(code, message, occurrenceIndex, bookingDate);
}

function isFinalFailure(error: unknown): boolean {
  return error instanceof RecurringBookingEligibilityError ||
    (error instanceof AppError && ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "VALIDATION"].includes(error.code));
}

function errorCategory(error: unknown): string {
  if (error instanceof RecurringBookingEligibilityError) return error.eligibilityCode;
  if (error instanceof AppError) return error.code;
  return "TRANSIENT";
}

export async function createRecurringBookings(
  input: Input,
  idempotency: BookingIdempotencyEnvelope,
): Promise<ActionResult<Result>> {
  let activeSubmission:
    | { submissionId: string; attemptToken: string; payloadHash: string }
    | null = null;
  try {
    const sessionUser = await requireSession();
    const user = sessionUser.role === "CUSTOMER"
      ? sessionUser
      : await requireWritablePermission("booking.create");
    const data = createRecurringBookingsSchema.parse(input);
    const storeId = currentStoreId(user);

    if (data.weeks > WEEKLY_RECURRENCE_SYSTEM_MAX_WEEKS) {
      eligibility("WEEKS_EXCEED_SYSTEM_LIMIT", "循環預約最多 12 週");
    }
    if (!idempotency?.requestKey) {
      throw new AppError("VALIDATION", "循環預約必須提供 requestKey");
    }

    const feature = await prisma.shopConfig.findUnique({
      where: { storeId },
      select: { weeklyRecurrenceEnabled: true, weeklyRecurrenceMaxWeeks: true },
    });
    if (!feature?.weeklyRecurrenceEnabled) {
      eligibility("FEATURE_DISABLED", "店鋪尚未開啟每週循環預約");
    }
    if (data.weeks > feature.weeklyRecurrenceMaxWeeks) {
      eligibility(
        "WEEKS_EXCEED_STORE_LIMIT",
        `店鋪目前最多可建立 ${feature.weeklyRecurrenceMaxWeeks} 週循環預約`,
      );
    }

    let effectiveCustomerId = data.customerId;
    if (user.role === "CUSTOMER") {
      const eligibleCustomer = await requireCustomerBookingEligibility(user);
      effectiveCustomerId = eligibleCustomer.customerId;
    }

    const { payloadHash } = buildBookingRecurringPayloadHash({
      storeId,
      actorUserId: user.id,
      canonicalCustomerId: effectiveCustomerId,
      servicePlanId: data.servicePlanId,
      customerPlanWalletId: data.customerPlanWalletId,
      bookingDate: data.bookingDate,
      slotTime: data.slotTime,
      people: data.people,
      weeks: data.weeks,
      notes: data.notes,
      skipDutyCheck: data.skipDutyCheck,
    });
    const claim = await claimBookingSubmission({
      storeId,
      requestKey: idempotency.requestKey,
      submissionType: "BOOKING_RECURRING",
      payloadHash,
      actorUserId: user.id,
      canonicalCustomerId: effectiveCustomerId,
      source: idempotency.source,
    });
    if (claim.kind === "replay") {
      if (!claim.snapshot.result.recurrenceGroupId) throw new Error("Recurring replay has no group ID");
      await sendRecurringBookingConfirmation(claim.snapshot.result.recurrenceGroupId).catch((notificationError) => {
        console.error("[createRecurringBookings] confirmation notification failed", notificationError);
      });
      revalidateBookings(effectiveCustomerId);
      return { success: true, data: {
        recurrenceGroupId: claim.snapshot.result.recurrenceGroupId,
        bookingIds: claim.snapshot.result.bookingIds,
      } };
    }
    if (claim.kind === "key_reused") throw new AppError("CONFLICT", "IDEMPOTENCY_KEY_REUSED：同一請求識別不可用於不同循環預約內容");
    if (claim.kind === "in_progress") throw new AppError("CONFLICT", "SUBMISSION_IN_PROGRESS：循環預約提交處理中，請稍後以相同請求重試");
    if (claim.kind === "failed_final") throw new AppError("BUSINESS_RULE", `此循環預約先前已被拒絕${claim.errorCategory ? `（${claim.errorCategory}）` : ""}`);
    activeSubmission = { submissionId: claim.submissionId, attemptToken: claim.attemptToken, payloadHash };

    const dates = generateWeeklyDateStrings(data.bookingDate, data.weeks);
    const bookingIds = await prisma.$transaction(async (tx) => {
      await acquireBookingSlotLocks(tx, dates.map((bookingDate) => ({
        storeId, bookingDate, slotTime: data.slotTime,
      })));

      const config = await tx.shopConfig.findUnique({
        where: { storeId },
        select: {
          weeklyRecurrenceEnabled: true,
          weeklyRecurrenceMaxWeeks: true,
          bookableUntilDate: true,
          dutySchedulingEnabled: true,
        },
      });
      if (!config?.weeklyRecurrenceEnabled) eligibility("FEATURE_DISABLED", "店鋪尚未開啟每週循環預約");
      if (data.weeks > config.weeklyRecurrenceMaxWeeks) eligibility("WEEKS_EXCEED_STORE_LIMIT", `店鋪目前最多可建立 ${config.weeklyRecurrenceMaxWeeks} 週循環預約`);
      if (dates[0] < toLocalDateStr()) eligibility("PAST_DATE", "不可預約過去的日期", 1, dates[0]);
      const bookableUntil = resolveBookableUntilDate(config.bookableUntilDate);
      if (dates.at(-1)! > bookableUntil) eligibility("BOOKABLE_UNTIL_EXCEEDED", `循環預約已超過店鋪開放日期 ${bookableUntil}`, dates.length, dates.at(-1));

      const customer = await tx.customer.findUnique({
        where: { id: effectiveCustomerId },
        include: { planWallets: { where: { status: "ACTIVE" } } },
      });
      if (!customer) eligibility("CUSTOMER_NOT_FOUND", "顧客不存在");
      if (user.role !== "CUSTOMER") assertStoreAccess(user, customer.storeId);
      try { assertCustomerInOperationStore(customer, storeId); }
      catch { eligibility("CUSTOMER_STORE_MISMATCH", "顧客不屬於目前店鋪"); }

      const plan = await tx.servicePlan.findUnique({
        where: { id: data.servicePlanId },
        select: { id: true, storeId: true, category: true, isActive: true },
      });
      if (!plan || !plan.isActive || plan.category !== "PACKAGE") {
        eligibility("PLAN_REQUIRED", "循環預約必須使用有效的套餐方案");
      }
      try { assertSameStore("ServicePlan", plan.storeId, storeId); }
      catch { eligibility("PLAN_STORE_MISMATCH", "課程方案不屬於目前店鋪"); }

      const lastDate = parseTaiwanDateToDbDate(dates.at(-1)!);
      const wallets = customer.planWallets.filter((wallet) =>
        wallet.storeId === storeId && wallet.planId === data.servicePlanId &&
        (!wallet.expiryDate || wallet.expiryDate >= lastDate),
      );
      if (data.customerPlanWalletId) {
        const requested = customer.planWallets.find((wallet) => wallet.id === data.customerPlanWalletId);
        if (!requested) eligibility("WALLET_REQUIRED", "指定的方案不屬於該顧客");
        if (requested.storeId !== storeId) eligibility("WALLET_STORE_MISMATCH", "指定的方案不屬於目前店鋪");
        if (requested.expiryDate && requested.expiryDate < lastDate) eligibility("WALLET_EXPIRED", `方案無法覆蓋最後一次預約 ${dates.at(-1)}`, dates.length, dates.at(-1));
      }
      if (wallets.length === 0) eligibility("WALLET_EXPIRED", `沒有可覆蓋最後一次預約 ${dates.at(-1)} 的方案`, dates.length, dates.at(-1));

      const availableByWallet = await tx.walletSession.groupBy({
        by: ["walletId"],
        where: { walletId: { in: wallets.map((wallet) => wallet.id) }, status: "AVAILABLE" },
        _count: { _all: true },
      });
      const remaining = new Map(availableByWallet.map((row) => [row.walletId, row._count._all]));
      const requiredSessions = data.weeks * data.people;
      const totalAvailable = [...remaining.values()].reduce((sum, count) => sum + count, 0);
      if (totalAvailable < requiredSessions) eligibility("INSUFFICIENT_SESSIONS", `方案可用堂數 ${totalAvailable} 不足，循環預約共需 ${requiredSessions} 堂`);

      const from = parseTaiwanDateToDbDate(dates[0]);
      const to = lastDate;
      const [hours, specials, overrides, duties] = await Promise.all([
        tx.businessHours.findMany({ where: { storeId } }),
        tx.specialBusinessDay.findMany({ where: { storeId, date: { gte: from, lte: to } } }),
        tx.slotOverride.findMany({ where: { storeId, date: { gte: from, lte: to } } }),
        config.dutySchedulingEnabled && !(data.skipDutyCheck && user.role === "ADMIN")
          ? tx.dutyAssignment.findMany({ where: { storeId, date: { gte: from, lte: to }, slotTime: data.slotTime }, select: { date: true } })
          : Promise.resolve([]),
      ]);
      const hoursMap = buildBusinessHoursMap(hours);
      const specialMap = buildSpecialDayMap(specials);
      const dutyDates = new Set(duties.map((duty) => duty.date.toISOString().slice(0, 10)));
      for (const [zeroIndex, date] of dates.entries()) {
        const occurrenceIndex = zeroIndex + 1;
        const rule = resolveDayRule({
          dateStr: date,
          dow: parseTaiwanDateToDbDate(date).getUTCDay(),
          specialDayMap: specialMap,
          businessHoursMap: hoursMap,
        });
        if (rule.closed) eligibility("CLOSED_DAY", `${date} 為公休或進修日`, occurrenceIndex, date);
        const dayOverrides = overrides.filter((item) => item.date.toISOString().slice(0, 10) === date);
        const slot = applySlotOverrides(rule, dayOverrides).find((item) => item.startTime === data.slotTime);
        if (!slot) eligibility("SLOT_INVALID", `${date} ${data.slotTime} 不是有效時段`, occurrenceIndex, date);
        if (!slot.isEnabled) eligibility("SLOT_DISABLED", `${date} ${data.slotTime} 時段已關閉`, occurrenceIndex, date);
        if (config.dutySchedulingEnabled && !(data.skipDutyCheck && user.role === "ADMIN") && !dutyDates.has(date)) {
          eligibility("DUTY_UNAVAILABLE", `${date} ${data.slotTime} 尚無值班人員`, occurrenceIndex, date);
        }
        const booked = await tx.booking.aggregate({
          where: {
            storeId,
            bookingDate: parseTaiwanDateToDbDate(date),
            slotTime: { in: bookingSlotTimeVariants(data.slotTime) },
            bookingStatus: { in: [...PENDING_STATUSES] },
          },
          _sum: { people: true },
        });
        if ((booked._sum.people ?? 0) + data.people > slot.capacity) {
          eligibility("CAPACITY_EXCEEDED", `${date} ${data.slotTime} 時段容量不足`, occurrenceIndex, date);
        }
      }

      const group = await tx.bookingRecurrenceGroup.create({ data: {
        storeId,
        customerId: effectiveCustomerId,
        startDate: parseTaiwanDateToDbDate(dates[0]),
        slotTime: data.slotTime,
        totalOccurrences: data.weeks,
        people: data.people,
      } });
      const bookedByType = user.role === "CUSTOMER" ? "CUSTOMER" : user.role === "ADMIN" ? "ADMIN" : "STAFF";
      const createdIds: string[] = [];
      for (const [zeroIndex, date] of dates.entries()) {
        const candidates = wallets.map((wallet) => ({
          id: wallet.id,
          expiryDate: wallet.expiryDate,
          createdAt: wallet.createdAt,
          remainingSessions: remaining.get(wallet.id) ?? 0,
        }));
        const created = await tx.booking.create({ data: {
          customerId: effectiveCustomerId,
          storeId,
          bookingDate: parseTaiwanDateToDbDate(date),
          slotTime: data.slotTime,
          revenueStaffId: snapshotRevenueStaffForBooking(customer.assignedStaffId),
          bookedByType,
          bookedByStaffId: user.role === "CUSTOMER" ? null : user.staffId ?? null,
          bookingType: "PACKAGE_SESSION",
          servicePlanId: data.servicePlanId,
          customerPlanWalletId: data.customerPlanWalletId ?? candidates[0]?.id ?? null,
          people: data.people,
          isMakeup: false,
          bookingStatus: "PENDING",
          notes: data.notes,
          recurrenceGroupId: group.id,
          recurrenceIndex: zeroIndex + 1,
        } });
        const allocation = await allocateSessionsFefo(tx, {
          candidates,
          bookingId: created.id,
          count: data.people,
          preferredWalletId: data.customerPlanWalletId,
        });
        for (const item of allocation.allocations) remaining.set(item.walletId, (remaining.get(item.walletId) ?? 0) - item.count);
        if (allocation.primaryWalletId !== created.customerPlanWalletId) {
          await tx.booking.update({ where: { id: created.id }, data: { customerPlanWalletId: allocation.primaryWalletId } });
        }
        createdIds.push(created.id);
      }

      await finalizeBookingSubmissionSuccess(tx, {
        ...activeSubmission!,
        snapshot: { version: 1, result: { bookingIds: createdIds, recurrenceGroupId: group.id } },
      });
      return { groupId: group.id, createdIds };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    revalidateBookings(effectiveCustomerId);
    await sendRecurringBookingConfirmation(bookingIds.groupId).catch((notificationError) => {
      console.error("[createRecurringBookings] confirmation notification failed", notificationError);
    });
    return { success: true, data: { recurrenceGroupId: bookingIds.groupId, bookingIds: bookingIds.createdIds } };
  } catch (error) {
    if (activeSubmission) {
      try {
        const finalize = isFinalFailure(error)
          ? finalizeBookingSubmissionFinalFailure
          : finalizeBookingSubmissionRetryableFailure;
        await finalize({
          submissionId: activeSubmission.submissionId,
          attemptToken: activeSubmission.attemptToken,
          errorCategory: errorCategory(error),
        });
      } catch (finalizeError) {
        console.error("[createRecurringBookings] failed to finalize submission", finalizeError);
      }
    }
    if (error instanceof RecurringBookingEligibilityError) {
      return { success: false, error: error.message };
    }
    return handleActionError(error);
  }
}
