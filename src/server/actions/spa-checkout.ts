"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { spaPrisma } from "@/lib/spa-db";
import { requireWritablePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { AppError, handleActionError } from "@/lib/errors";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
import type { ActionResult } from "@/types";
import { requireSpaStore } from "@/lib/industry-module-server";
import { canCompleteSpaBooking } from "@/lib/spa-booking-completion";
import { toLocalDateStr } from "@/lib/date-utils";

const bookingSchema = z.object({ bookingId: z.string().min(1) });
const packageSchema = bookingSchema.extend({ walletId: z.string().min(1) });
const paymentSchema = bookingSchema.extend({
  paymentMethod: z.enum(["CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD", "OTHER"]),
  amount: z.number().int().positive(),
  note: z.string().trim().max(300).optional(),
  completeService: z.boolean().default(true),
});

async function requireSpaCheckoutStore() {
  const user = await requireWritablePermission("booking.update");
  const storeId = await resolveWriteStoreId(user);
  await requireSpaStore(storeId);
  await assertStoreSubscriptionWritable(storeId);
  return { user, storeId };
}

function revalidateSpaBooking() {
  revalidatePath("/dashboard/bookings");
  revalidatePath("/liff/manager-preview");
  revalidatePath("/liff/staff-preview");
}

function assertSpaBookingCanComplete(booking: {
  bookingDate: Date;
  startTime: string;
}) {
  if (!canCompleteSpaBooking(toLocalDateStr(booking.bookingDate), booking.startTime)) {
    throw new AppError("BUSINESS_RULE", "預約時間尚未開始，無法提前完成服務或結帳");
  }
}

export async function checkInSpaBooking(input: z.infer<typeof bookingSchema>): Promise<ActionResult<{ bookingId: string }>> {
  try {
    const { storeId } = await requireSpaCheckoutStore();
    const { bookingId } = bookingSchema.parse(input);
    const booking = await spaPrisma.spaBooking.findFirst({ where: { id: bookingId, storeId } });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");
    if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") throw new AppError("BUSINESS_RULE", "只有待服務的預約可以確認到店");
    await spaPrisma.spaBooking.update({ where: { id: booking.id }, data: { checkedInAt: new Date() } });
    revalidateSpaBooking();
    return { success: true, data: { bookingId: booking.id } };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function settleSpaBookingWithPayment(input: z.infer<typeof paymentSchema>): Promise<ActionResult<{ bookingId: string; serviceCompleted: boolean }>> {
  try {
    const { user, storeId } = await requireSpaCheckoutStore();
    const data = paymentSchema.parse(input);
    const booking = await spaPrisma.spaBooking.findFirst({ where: { id: data.bookingId, storeId } });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");
    if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") throw new AppError("BUSINESS_RULE", "此預約狀態無法收款");
    assertSpaBookingCanComplete(booking);
    const grossAmount = Number(booking.totalPriceSnapshot);
    if (data.amount > grossAmount) throw new AppError("VALIDATION", "實收金額不可高於原價");

    await spaPrisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SpaBooking" WHERE id = ${booking.id} FOR UPDATE`;
      if (await tx.spaPayment.findFirst({ where: { bookingId: booking.id, storeId, refundOfPaymentId: null, status: { in: ["PENDING", "SUCCESS"] } } })) {
        throw new AppError("BUSINESS_RULE", "此預約已建立付款，請勿重複收款");
      }
      const paidAt = new Date();
      await tx.spaPayment.create({
        data: {
          storeId,
          customerId: booking.customerId,
          bookingId: booking.id,
          revenueStaffId: booking.revenueStaffId ?? booking.serviceStaffId,
          soldByStaffId: user.staffId ?? null,
          grossAmount,
          netAmount: data.amount,
          paymentMethod: data.paymentMethod,
          status: "SUCCESS",
          paidAt,
          note: data.note,
        },
      });
      if (data.completeService) await tx.spaBooking.update({ where: { id: booking.id }, data: { status: "COMPLETED", completedAt: paidAt } });
    });
    revalidateSpaBooking();
    return { success: true, data: { bookingId: booking.id, serviceCompleted: data.completeService } };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function settleSpaBookingWithPackage(input: z.infer<typeof packageSchema>): Promise<ActionResult<{ bookingId: string }>> {
  try {
    const { user, storeId } = await requireSpaCheckoutStore();
    const data = packageSchema.parse(input);
    const booking = await spaPrisma.spaBooking.findFirst({ where: { id: data.bookingId, storeId } });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");
    if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") throw new AppError("BUSINESS_RULE", "此預約狀態無法扣療程");
    assertSpaBookingCanComplete(booking);

    await spaPrisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SpaBooking" WHERE id = ${booking.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "SpaEntitlement" WHERE id = ${data.walletId} FOR UPDATE`;
      const entitlement = await tx.spaEntitlement.findFirst({ where: { id: data.walletId, storeId, customerId: booking.customerId, status: "ACTIVE", remainingUses: { gte: 1 } } });
      if (!entitlement) throw new AppError("BUSINESS_RULE", "此療程已無可用次數");
      const now = new Date();
      await tx.spaEntitlementUse.create({ data: { storeId, entitlementId: entitlement.id, bookingId: booking.id, uses: 1, status: "COMPLETED", completedAt: now } });
      const remainingUses = entitlement.remainingUses - 1;
      await tx.spaEntitlement.update({ where: { id: entitlement.id }, data: { remainingUses, status: remainingUses === 0 ? "EXHAUSTED" : "ACTIVE" } });
      await tx.spaPayment.create({ data: { storeId, customerId: booking.customerId, bookingId: booking.id, revenueStaffId: booking.revenueStaffId ?? booking.serviceStaffId, soldByStaffId: user.staffId ?? null, grossAmount: booking.totalPriceSnapshot, netAmount: 0, paymentMethod: "ENTITLEMENT", status: "SUCCESS", paidAt: now, note: `扣療程｜${entitlement.nameSnapshot}` } });
      await tx.spaBooking.update({ where: { id: booking.id }, data: { status: "COMPLETED", completedAt: now } });
    });
    revalidateSpaBooking();
    return { success: true, data: { bookingId: booking.id } };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function settleSpaBookingWithStoredValue(input: z.infer<typeof bookingSchema>): Promise<ActionResult<{ bookingId: string; remainingBalance: number }>> {
  try {
    const { user, storeId } = await requireSpaCheckoutStore();
    const { bookingId } = bookingSchema.parse(input);
    const booking = await spaPrisma.spaBooking.findFirst({ where: { id: bookingId, storeId } });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");
    if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") throw new AppError("BUSINESS_RULE", "此預約狀態無法使用儲值金結帳");
    assertSpaBookingCanComplete(booking);
    const amount = Number(booking.totalPriceSnapshot);

    const remainingBalance = await spaPrisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SpaBooking" WHERE id = ${booking.id} FOR UPDATE`;
      const wallet = await tx.spaStoredValueWallet.findUnique({ where: { storeId_customerId: { storeId, customerId: booking.customerId } } });
      if (!wallet || wallet.status !== "ACTIVE") throw new AppError("BUSINESS_RULE", "此顧客目前沒有可用的儲值金帳戶");
      await tx.$queryRaw`SELECT id FROM "SpaStoredValueWallet" WHERE id = ${wallet.id} FOR UPDATE`;
      const locked = await tx.spaStoredValueWallet.findUnique({ where: { id: wallet.id } });
      const balance = Number(locked?.balance ?? 0);
      if (balance < amount) throw new AppError("BUSINESS_RULE", `儲值金餘額不足，目前 NT$ ${balance.toLocaleString("zh-TW")}`);
      const now = new Date();
      const payment = await tx.spaPayment.create({ data: { storeId, customerId: booking.customerId, bookingId: booking.id, revenueStaffId: booking.revenueStaffId ?? booking.serviceStaffId, soldByStaffId: user.staffId ?? null, grossAmount: amount, netAmount: amount, paymentMethod: "STORED_VALUE", status: "SUCCESS", paidAt: now, note: `儲值金扣款｜${booking.serviceNameSnapshot}` } });
      const nextBalance = balance - amount;
      await tx.spaStoredValueWallet.update({ where: { id: wallet.id }, data: { balance: nextBalance } });
      await tx.spaStoredValueEntry.create({ data: { walletId: wallet.id, storeId, customerId: booking.customerId, bookingId: booking.id, paymentId: payment.id, entryType: "DEBIT", amount: -amount, balanceAfter: nextBalance, note: booking.serviceNameSnapshot } });
      await tx.spaBooking.update({ where: { id: booking.id }, data: { status: "COMPLETED", completedAt: now } });
      return nextBalance;
    });
    revalidateSpaBooking();
    return { success: true, data: { bookingId: booking.id, remainingBalance } };
  } catch (error) {
    return handleActionError(error);
  }
}
