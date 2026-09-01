"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWritablePermission } from "@/lib/permissions";
import { currentStoreId } from "@/lib/store";
import { SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { AppError, handleActionError } from "@/lib/errors";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
import { buildTransactionSnapshot } from "@/lib/transaction-snapshot";
import { revalidateBookings, revalidateTransactions } from "@/lib/revalidation";
import { adjustCheckoutToPackage } from "@/server/actions/booking-checkout";
import { markCompleted } from "@/server/actions/booking";
import { completePaidBookingInTransaction } from "@/server/services/paid-booking-completion";
import { createBookingCompletedEvent } from "@/server/services/referral-events";
import type { ActionResult } from "@/types";
import { requireSpaStore } from "@/lib/industry-module-server";

const settleSpaPackageSchema = z.object({
  bookingId: z.string().min(1),
  walletId: z.string().min(1),
});

const spaBookingSchema = z.object({ bookingId: z.string().min(1) });

async function requireSpaCheckoutStore() {
  const user = await requireWritablePermission("booking.update");
  const storeId = currentStoreId(user);
  await requireSpaStore(storeId);
  if (storeId !== SPA_DEMO_STORE.id) {
    throw new AppError("FORBIDDEN", "SPA 現場結帳目前只開放 Demo 店驗收");
  }
  await assertStoreSubscriptionWritable(storeId);
  return { user, storeId };
}

/** Optional operational step: mark the customer present without completing service. */
export async function checkInSpaBooking(
  input: z.infer<typeof spaBookingSchema>,
): Promise<ActionResult<{ bookingId: string }>> {
  try {
    const { storeId } = await requireSpaCheckoutStore();
    const { bookingId } = spaBookingSchema.parse(input);
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, storeId },
      select: { id: true, customerId: true, bookingStatus: true },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");
    if (booking.bookingStatus !== "PENDING" && booking.bookingStatus !== "CONFIRMED") {
      throw new AppError("BUSINESS_RULE", "只有待服務的預約可以確認到店");
    }
    await prisma.booking.update({
      where: { id: booking.id },
      data: { isCheckedIn: true },
    });
    revalidateBookings(booking.customerId);
    return { success: true, data: { bookingId: booking.id } };
  } catch (error) {
    return handleActionError(error);
  }
}

/** SPA Demo coordinator: reserve an existing treatment entitlement, then deduct it. */
export async function settleSpaBookingWithPackage(
  input: z.infer<typeof settleSpaPackageSchema>,
): Promise<ActionResult<{ bookingId: string }>> {
  try {
    await requireSpaCheckoutStore();
    const data = settleSpaPackageSchema.parse(input);
    const adjusted = await adjustCheckoutToPackage(data);
    if (!adjusted.success) throw new AppError("BUSINESS_RULE", adjusted.error);

    const completed = await markCompleted(data.bookingId);
    if (!completed.success) {
      throw new AppError(
        "CONFLICT",
        `療程已保留，但完成扣次未成功：${completed.error}。請重新開啟預約後按「完成服務」。`,
      );
    }
    return { success: true, data: { bookingId: data.bookingId } };
  } catch (error) {
    return handleActionError(error);
  }
}

/**
 * Deduct a monetary stored-value wallet and complete the service atomically.
 * The wallet ledger is the funding source; Transaction remains the service
 * consumption record and is deliberately marked OTHER (non-cash) so it never
 * increases the physical cash drawer.
 */
export async function settleSpaBookingWithStoredValue(
  input: z.infer<typeof spaBookingSchema>,
): Promise<ActionResult<{ bookingId: string; remainingBalance: number }>> {
  try {
    const { user, storeId } = await requireSpaCheckoutStore();
    const { bookingId } = spaBookingSchema.parse(input);

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, storeId },
      select: {
        id: true,
        bookingType: true,
        bookingStatus: true,
        customerId: true,
        revenueStaffId: true,
        serviceStaffId: true,
        servicePlanId: true,
        treatmentNameSnapshot: true,
        treatmentPriceSnapshot: true,
        bookingDate: true,
        slotTime: true,
        servicePlan: { select: { price: true } },
        customer: {
          select: { assignedStaffId: true, sponsorId: true },
        },
      },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");
    if (booking.bookingType !== "SINGLE") {
      throw new AppError("BUSINESS_RULE", "只有單次服務可改用儲值金結帳");
    }
    if (booking.bookingStatus !== "PENDING" && booking.bookingStatus !== "CONFIRMED") {
      throw new AppError("BUSINESS_RULE", "此預約狀態無法使用儲值金結帳");
    }

    const amount =
      booking.treatmentPriceSnapshot != null
        ? Number(booking.treatmentPriceSnapshot)
        : booking.servicePlan?.price != null
          ? Number(booking.servicePlan.price)
          : 799;
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new AppError("VALIDATION", "本次服務金額無效");
    }
    const revenueStaffId =
      booking.revenueStaffId ??
      booking.serviceStaffId ??
      booking.customer.assignedStaffId ??
      user.staffId;
    if (!revenueStaffId) {
      throw new AppError("FORBIDDEN", "無法判定本次服務的營收歸屬");
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${booking.id} FOR UPDATE`;
      const existing = await tx.transaction.findFirst({
        where: {
          bookingId: booking.id,
          transactionType: "SINGLE_PURCHASE",
          status: "SUCCESS",
        },
        select: { id: true },
      });
      if (existing) throw new AppError("BUSINESS_RULE", "此預約已完成結帳，請勿重複扣款");

      const wallet = await tx.storedValueWallet.findUnique({
        where: { storeId_customerId: { storeId, customerId: booking.customerId } },
        select: { id: true, balance: true, status: true },
      });
      if (!wallet || wallet.status !== "ACTIVE") {
        throw new AppError("BUSINESS_RULE", "此顧客目前沒有可用的儲值金帳戶");
      }
      await tx.$queryRaw`SELECT id FROM "StoredValueWallet" WHERE id = ${wallet.id} FOR UPDATE`;
      const lockedWallet = await tx.storedValueWallet.findUnique({
        where: { id: wallet.id },
        select: { balance: true, status: true },
      });
      const currentBalance = Number(lockedWallet?.balance ?? 0);
      if (lockedWallet?.status !== "ACTIVE" || currentBalance < amount) {
        throw new AppError(
          "BUSINESS_RULE",
          `儲值金餘額不足，目前 NT$ ${currentBalance.toLocaleString("zh-TW")}`,
        );
      }

      const snapshot = await buildTransactionSnapshot(tx, {
        customerId: booking.customerId,
        storeId,
        revenueStaffId,
        planId: booking.servicePlanId ?? null,
        grossAmount: amount,
        netAmount: amount,
      });
      const transaction = await tx.transaction.create({
        data: {
          customerId: booking.customerId,
          bookingId: booking.id,
          revenueStaffId,
          serviceStaffId: booking.serviceStaffId ?? user.staffId ?? null,
          soldByStaffId: user.staffId ?? null,
          transactionType: "SINGLE_PURCHASE",
          paymentMethod: "OTHER",
          paymentStatus: "SUCCESS",
          paidAt: new Date(),
          amount,
          storeId,
          note: `儲值金扣款${booking.treatmentNameSnapshot ? `｜${booking.treatmentNameSnapshot}` : ""}`,
          ...snapshot,
        },
      });
      const remainingBalance = currentBalance - amount;
      await tx.storedValueWallet.update({
        where: { id: wallet.id },
        data: { balance: remainingBalance },
      });
      await tx.storedValueLedgerEntry.create({
        data: {
          walletId: wallet.id,
          storeId,
          customerId: booking.customerId,
          bookingId: booking.id,
          transactionId: transaction.id,
          entryType: "DEBIT",
          amount: -amount,
          balanceAfter: remainingBalance,
          note: booking.treatmentNameSnapshot ?? "SPA 現場服務",
        },
      });
      await completePaidBookingInTransaction(tx, {
        bookingId: booking.id,
        bookingType: booking.bookingType,
        customerId: booking.customerId,
        storeId,
        bookingDate: booking.bookingDate,
        slotTime: booking.slotTime,
        serviceStaffId: booking.serviceStaffId ?? user.staffId ?? null,
      });
      return { remainingBalance };
    });

    try {
      await createBookingCompletedEvent({
        storeId,
        customerId: booking.customerId,
        referrerId: booking.customer.sponsorId ?? null,
        bookingId: booking.id,
        source: "stored-value-and-complete",
      });
    } catch {
      // Referral tracking must never roll back the atomic checkout.
    }
    revalidateBookings(booking.customerId);
    revalidateTransactions(booking.customerId);
    return {
      success: true,
      data: { bookingId: booking.id, remainingBalance: result.remainingBalance },
    };
  } catch (error) {
    return handleActionError(error);
  }
}
