"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  SPA_DEMO_LIVE_FLOW_BOOKING_ID,
  SPA_DEMO_LIVE_FLOW_PACKAGE_PLAN_ID,
  SPA_DEMO_LIVE_FLOW_PACKAGE_TRANSACTION_ID,
  SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
  SPA_DEMO_LIVE_FLOW_STORED_LEDGER_ID,
  SPA_DEMO_LIVE_FLOW_STORED_TRANSACTION_ID,
  SPA_DEMO_STORE,
} from "@/lib/spa-demo-store";

const inputSchema = z.object({
  bookingId: z.literal(SPA_DEMO_LIVE_FLOW_BOOKING_ID),
  settlement: z.enum(["CASH", "CREDIT_CARD", "STORED_VALUE", "PACKAGE"]),
});

const SETTLEMENT_LABEL = {
  CASH: "現金",
  CREDIT_CARD: "刷卡",
  STORED_VALUE: "儲值金",
  PACKAGE: "扣療程 1 次",
} as const;

export async function completeSpaDemoBooking(input: unknown) {
  if (process.env.VERCEL_ENV === "production") {
    return { success: false as const, error: "Demo 結帳不在正式站開放" };
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "結帳資料不完整" };

  const booking = await prisma.booking.findFirst({
    where: { id: parsed.data.bookingId, storeId: SPA_DEMO_STORE.id },
    select: {
      id: true,
      bookingStatus: true,
      treatmentPriceSnapshot: true,
      customerId: true,
      revenueStaffId: true,
      serviceStaffId: true,
      customer: { select: { storeId: true } },
      serviceStaff: { select: { storeId: true } },
    },
  });
  if (!booking || booking.customer.storeId !== SPA_DEMO_STORE.id || booking.serviceStaff?.storeId !== SPA_DEMO_STORE.id) {
    return { success: false as const, error: "Demo 預約不存在或資料隔離檢查失敗" };
  }
  if (booking.bookingStatus === "COMPLETED") {
    return { success: false as const, error: "此筆服務已完成，請勿重複結帳" };
  }
  if (!(["PENDING", "CONFIRMED"] as const).includes(booking.bookingStatus as "PENDING" | "CONFIRMED")) {
    return { success: false as const, error: "此預約狀態目前不能完成服務" };
  }

  const amount = Number(booking.treatmentPriceSnapshot ?? 0);
  const label = SETTLEMENT_LABEL[parsed.data.settlement];
  let result: { storedValueBalance: number | null; packageRemainingSessions: number | null };
  try {
    result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${booking.id} FOR UPDATE`;
    const current = await tx.booking.findUnique({ where: { id: booking.id }, select: { bookingStatus: true } });
    if (!current || current.bookingStatus === "COMPLETED") throw new Error("SPA_DEMO_ALREADY_COMPLETED");

    let storedValueBalance: number | null = null;
    let packageRemainingSessions: number | null = null;
    if (parsed.data.settlement === "STORED_VALUE") {
      const wallet = await tx.storedValueWallet.findFirst({
        where: { storeId: SPA_DEMO_STORE.id, customerId: booking.customerId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!wallet) throw new Error("SPA_DEMO_STORED_WALLET_MISSING");
      await tx.$queryRaw`SELECT id FROM "StoredValueWallet" WHERE id = ${wallet.id} FOR UPDATE`;
      const locked = await tx.storedValueWallet.findUnique({ where: { id: wallet.id }, select: { balance: true } });
      const balance = Number(locked?.balance ?? 0);
      if (amount <= 0 || balance < amount) throw new Error("SPA_DEMO_STORED_VALUE_INSUFFICIENT");
      storedValueBalance = balance - amount;
      const transaction = await tx.transaction.create({
        data: {
          id: SPA_DEMO_LIVE_FLOW_STORED_TRANSACTION_ID,
          customerId: booking.customerId,
          storeId: SPA_DEMO_STORE.id,
          bookingId: booking.id,
          revenueStaffId: booking.revenueStaffId ?? booking.serviceStaffId!,
          serviceStaffId: booking.serviceStaffId,
          transactionType: "SINGLE_PURCHASE",
          paymentMethod: "OTHER",
          paymentStatus: "SUCCESS",
          paidAt: new Date(),
          amount,
          netAmount: amount,
          note: "SPA Demo 儲值金扣款",
        },
      });
      await tx.storedValueWallet.update({ where: { id: wallet.id }, data: { balance: storedValueBalance } });
      await tx.storedValueLedgerEntry.create({
        data: {
          id: SPA_DEMO_LIVE_FLOW_STORED_LEDGER_ID,
          walletId: wallet.id,
          storeId: SPA_DEMO_STORE.id,
          customerId: booking.customerId,
          bookingId: booking.id,
          transactionId: transaction.id,
          entryType: "DEBIT",
          amount: -amount,
          balanceAfter: storedValueBalance,
          note: "全身精油舒壓",
        },
      });
    }

    if (parsed.data.settlement === "PACKAGE") {
      await tx.$queryRaw`SELECT id FROM "CustomerPlanWallet" WHERE id = ${SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID} FOR UPDATE`;
      const wallet = await tx.customerPlanWallet.findFirst({
        where: { id: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID, storeId: SPA_DEMO_STORE.id, customerId: booking.customerId, status: "ACTIVE", remainingSessions: { gt: 0 } },
        select: { id: true, remainingSessions: true },
      });
      if (!wallet) throw new Error("SPA_DEMO_PACKAGE_WALLET_EMPTY");
      const session = await tx.walletSession.findFirst({ where: { walletId: wallet.id, status: "AVAILABLE" }, orderBy: { sessionNo: "asc" }, select: { id: true } });
      if (!session) throw new Error("SPA_DEMO_PACKAGE_SESSION_EMPTY");
      const reserved = await tx.walletSession.updateMany({ where: { id: session.id, status: "AVAILABLE" }, data: { status: "RESERVED", bookingId: booking.id, reservedAt: new Date() } });
      if (reserved.count !== 1) throw new Error("SPA_DEMO_PACKAGE_SESSION_CONFLICT");
      await tx.walletSession.update({ where: { id: session.id }, data: { status: "COMPLETED", completedAt: new Date() } });
      packageRemainingSessions = wallet.remainingSessions - 1;
      await tx.customerPlanWallet.update({ where: { id: wallet.id }, data: { remainingSessions: packageRemainingSessions, status: packageRemainingSessions === 0 ? "USED_UP" : "ACTIVE" } });
      await tx.transaction.create({
        data: {
          id: SPA_DEMO_LIVE_FLOW_PACKAGE_TRANSACTION_ID,
          customerId: booking.customerId,
          storeId: SPA_DEMO_STORE.id,
          bookingId: booking.id,
          revenueStaffId: booking.revenueStaffId ?? booking.serviceStaffId!,
          serviceStaffId: booking.serviceStaffId,
          customerPlanWalletId: wallet.id,
          planId: SPA_DEMO_LIVE_FLOW_PACKAGE_PLAN_ID,
          transactionType: "SESSION_DEDUCTION",
          paymentMethod: "CASH",
          paymentStatus: "SUCCESS",
          paidAt: new Date(),
          amount: 0,
          quantity: 1,
          note: "SPA Demo 完成服務扣療程 1 次",
        },
      });
    }

    await tx.booking.update({
      where: { id: booking.id },
      data: {
        bookingStatus: "COMPLETED",
        ...(parsed.data.settlement === "PACKAGE" ? { bookingType: "PACKAGE_SESSION", servicePlanId: SPA_DEMO_LIVE_FLOW_PACKAGE_PLAN_ID, customerPlanWalletId: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID } : {}),
        notes: `SPA_DEMO_LIVE_FLOW|settlement=${parsed.data.settlement}|label=${label}|amount=${amount}`,
      },
    });
      return { storedValueBalance, packageRemainingSessions };
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SPA_DEMO_STORED_VALUE_INSUFFICIENT") return { success: false as const, error: "儲值金餘額不足" };
    if (message === "SPA_DEMO_PACKAGE_WALLET_EMPTY" || message === "SPA_DEMO_PACKAGE_SESSION_EMPTY") return { success: false as const, error: "療程剩餘次數不足" };
    if (message === "SPA_DEMO_ALREADY_COMPLETED") return { success: false as const, error: "此筆服務已完成，請勿重複結帳" };
    return { success: false as const, error: "目前無法完成結帳，請重新整理後再試" };
  }

  revalidatePath("/liff/design-preview");
  revalidatePath("/liff/manager-preview");
  revalidatePath("/liff/staff-preview");
  return {
    success: true as const,
    data: { bookingId: booking.id, settlementLabel: label, amount, ...result },
  };
}
