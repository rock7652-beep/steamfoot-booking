"use server";

import type { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWritablePermission } from "@/lib/permissions";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
import { AppError, handleActionError } from "@/lib/errors";
import { currentStoreId } from "@/lib/store";
import { purchasePlanForSingleBookingSchema } from "@/lib/validators/booking-checkout";
import { allocateSessionsFefo, seedWalletSessions } from "@/server/services/wallet-session";
import { revalidateBookings } from "@/lib/revalidation";
import type { ActionResult } from "@/types";
import { buildTransactionSnapshot } from "@/lib/transaction-snapshot";
import { addTaiwanDuration, parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";

type PurchasePlanOption = { id: string; name: string; price: number; sessionCount: number };

export async function getSingleBookingPurchasePlans(bookingId: string): Promise<ActionResult<PurchasePlanOption[]>> {
  try {
    const user = await requireWritablePermission("booking.update");
    const storeId = currentStoreId(user);
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, storeId },
      select: { bookingType: true, bookingStatus: true, isMakeup: true },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");
    if (booking.bookingType !== "SINGLE" || booking.isMakeup) throw new AppError("BUSINESS_RULE", "此預約不適用轉購新方案");
    if (!["PENDING", "CONFIRMED"].includes(booking.bookingStatus)) throw new AppError("BUSINESS_RULE", "此預約狀態無法轉購新方案");
    const plans = await prisma.servicePlan.findMany({
      where: { storeId, isActive: true, sessionCount: { gt: 1 } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, price: true, sessionCount: true },
    });
    return { success: true, data: plans.map((p) => ({ ...p, price: Number(p.price) })) };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function purchasePlanForSingleBooking(
  input: z.infer<typeof purchasePlanForSingleBookingSchema>,
): Promise<ActionResult<{ transactionId: string; walletId: string | null; pendingPayment: boolean }>> {
  try {
    const user = await requireWritablePermission("wallet.create");
    const data = purchasePlanForSingleBookingSchema.parse(input);
    const storeId = currentStoreId(user);
    await assertStoreSubscriptionWritable(storeId);
    const booking = await prisma.booking.findFirst({
      where: { id: data.bookingId, storeId },
      select: { id: true, customerId: true, people: true },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");
    const plan = await prisma.servicePlan.findFirst({
      where: { id: data.planId, storeId, isActive: true },
      select: { id: true, price: true, sessionCount: true, validityDays: true },
    });
    if (!plan) throw new AppError("NOT_FOUND", "方案不存在、已停用或不屬於本店");
    if (plan.sessionCount <= 1) throw new AppError("BUSINESS_RULE", "轉購請選擇多堂儲值方案");
    if (plan.sessionCount < booking.people) throw new AppError("BUSINESS_RULE", `方案共 ${plan.sessionCount} 堂，不足本次 ${booking.people} 人使用`);
    const grossAmount = Number(plan.price);
    if (data.amount > grossAmount) throw new AppError("VALIDATION", "實收金額不可高於原價");

    const isPending = data.paymentMethod === "TRANSFER";
    const now = new Date();
    const today = toLocalDateStr(now);
    const expiryDate = plan.validityDays ? parseTaiwanDateToDbDate(addTaiwanDuration(today, plan.validityDays, "DAY")) : null;
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${booking.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${booking.customerId} FOR UPDATE`;
      const activationTime = new Date();
      const fresh = await tx.booking.findUnique({
        where: { id: booking.id },
        select: { bookingType: true, bookingStatus: true, isMakeup: true, customerId: true, people: true },
      });
      if (!fresh || fresh.bookingType !== "SINGLE" || fresh.isMakeup || !["PENDING", "CONFIRMED"].includes(fresh.bookingStatus)) throw new AppError("CONFLICT", "預約狀態已變更，請重新整理");
      const existing = await tx.transaction.findFirst({
        where: { bookingId: booking.id, status: "SUCCESS", paymentStatus: { in: ["PENDING", "SUCCESS", "CONFIRMED"] } },
        select: { id: true },
      });
      if (existing) throw new AppError("CONFLICT", "此預約已有收款或待確認付款，請勿重複操作");
      const customer = await tx.customer.findUnique({ where: { id: fresh.customerId }, select: { assignedStaffId: true, convertedAt: true, customerStage: true, selfBookingEnabled: true } });
      if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
      const revenueStaffId = customer.assignedStaffId ?? user.staffId!;
      const wallet = isPending ? null : await tx.customerPlanWallet.create({
        data: { customerId: fresh.customerId, storeId, planId: plan.id, purchasedPrice: plan.price, totalSessions: plan.sessionCount, remainingSessions: plan.sessionCount, startDate: parseTaiwanDateToDbDate(today), expiryDate, status: "ACTIVE" },
      });
      if (wallet) {
        await seedWalletSessions(tx, wallet.id, plan.sessionCount);
        await allocateSessionsFefo(tx, { candidates: [{ id: wallet.id, expiryDate, createdAt: activationTime, remainingSessions: plan.sessionCount }], bookingId: booking.id, count: fresh.people, preferredWalletId: wallet.id });
        await tx.booking.update({ where: { id: booking.id }, data: { bookingType: "PACKAGE_SESSION", customerPlanWalletId: wallet.id, servicePlanId: plan.id } });
        await tx.customer.update({ where: { id: fresh.customerId }, data: { customerStage: "ACTIVE", selfBookingEnabled: true, ...(!customer.convertedAt && { convertedAt: activationTime }) } });
      }
      const snapshot = await buildTransactionSnapshot(tx, { customerId: fresh.customerId, storeId, revenueStaffId, planId: plan.id, grossAmount, netAmount: data.amount });
      const transaction = await tx.transaction.create({
        data: { ...snapshot, customerId: fresh.customerId, storeId, bookingId: booking.id, revenueStaffId, soldByStaffId: user.staffId ?? null, customerPlanWalletId: wallet?.id ?? null, transactionType: "PACKAGE_PURCHASE", paymentMethod: data.paymentMethod, paymentStatus: isPending ? "PENDING" : "SUCCESS", paidAt: isPending ? null : activationTime, conversionEffectsApplied: !isPending, conversionSnapshotCaptured: true, preConversionCustomerStage: !isPending ? customer.customerStage : null, preConversionSelfBookingEnabled: !isPending ? customer.selfBookingEnabled : null, preConversionConvertedAt: !isPending ? customer.convertedAt : null, conversionAppliedConvertedAt: !isPending ? (customer.convertedAt ?? activationTime) : null, status: "SUCCESS", amount: data.amount, planId: plan.id, planSessionCountSnapshot: plan.sessionCount, pendingWalletExpiryDateSnapshot: isPending ? expiryDate : null, discountReason: data.discountReason || null, note: data.note || null },
      });
      return { transactionId: transaction.id, walletId: wallet?.id ?? null };
    });
    revalidateBookings(booking.customerId);
    return { success: true, data: { ...result, pendingPayment: isPending } };
  } catch (e) {
    return handleActionError(e);
  }
}
