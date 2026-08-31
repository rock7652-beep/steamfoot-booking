"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  SPA_DEMO_LIVE_FLOW_BOOKING_IDS,
  SPA_DEMO_LIVE_FLOW_PACKAGE_PLAN_ID,
  SPA_DEMO_LIVE_FLOW_PACKAGE_TRANSACTION_ID,
  SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
  SPA_DEMO_LIVE_FLOW_STORED_LEDGER_ID,
  SPA_DEMO_LIVE_FLOW_STORED_TRANSACTION_ID,
  SPA_DEMO_LIVE_FLOW_TRANSACTION_ID,
  SPA_DEMO_STORE,
} from "@/lib/spa-demo-store";

const inputSchema = z.object({
  bookingId: z.enum(SPA_DEMO_LIVE_FLOW_BOOKING_IDS),
  settlement: z.enum(["CASH", "CREDIT_CARD", "STORED_VALUE", "PACKAGE"]),
});

const guestInputSchema = z.object({
  bookingId: z.enum(SPA_DEMO_LIVE_FLOW_BOOKING_IDS),
  settlement: z.enum(["CASH", "CREDIT_CARD", "STORED_VALUE", "PACKAGE"]),
});

const SETTLEMENT_LABEL = {
  CASH: "現金",
  CREDIT_CARD: "刷卡",
  STORED_VALUE: "儲值金",
  PACKAGE: "扣療程",
} as const;

const PAYMENT_METHOD = {
  CASH: "CASH",
  CREDIT_CARD: "CREDIT_CARD",
  STORED_VALUE: "OTHER",
  PACKAGE: "OTHER",
} as const;

export async function completeSpaDemoBooking(input: unknown) {
  if (process.env.VERCEL_ENV === "production") {
    return { success: false as const, error: "Demo 結帳不在正式站開放" };
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "結帳資料不完整" };

  const selected = await prisma.booking.findFirst({
    where: { id: parsed.data.bookingId, storeId: SPA_DEMO_STORE.id },
    select: {
      id: true,
      bookingDate: true,
      slotTime: true,
      customerId: true,
      notes: true,
      customer: { select: { storeId: true } },
      serviceStaff: { select: { storeId: true } },
    },
  });
  if (!selected || selected.customer.storeId !== SPA_DEMO_STORE.id || selected.serviceStaff?.storeId !== SPA_DEMO_STORE.id) {
    return { success: false as const, error: "Demo 預約不存在或資料隔離檢查失敗" };
  }
  const partySize = Number(selected.notes?.match(/\|party=(\d+)/)?.[1] ?? 1);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > SPA_DEMO_LIVE_FLOW_BOOKING_IDS.length) {
    return { success: false as const, error: "多人預約資料不完整" };
  }

  let result: {
    bookingIds: string[];
    storedValueBalance: number | null;
    packageRemainingSessions: number | null;
    amount: number;
  };
  try {
    result = await prisma.$transaction(async (tx) => {
      const expectedIds: string[] = [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS.slice(0, partySize)];
      for (const bookingId of expectedIds) {
        await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
      }
      const group = await tx.booking.findMany({
        where: {
          id: { in: expectedIds },
          storeId: SPA_DEMO_STORE.id,
          customerId: selected.customerId,
          bookingDate: selected.bookingDate,
          slotTime: selected.slotTime,
          bookingStatus: { not: "CANCELLED" },
        },
        select: {
          id: true,
          bookingStatus: true,
          treatmentPriceSnapshot: true,
          customerId: true,
          revenueStaffId: true,
          serviceStaffId: true,
          notes: true,
        },
        orderBy: { id: "asc" },
      });
      if (group.length !== partySize || group.some((booking) => !expectedIds.includes(booking.id))) {
        throw new Error("SPA_DEMO_GROUP_INCOMPLETE");
      }
      if (group.some((booking) => booking.bookingStatus === "COMPLETED")) {
        throw new Error("SPA_DEMO_ALREADY_COMPLETED");
      }
      if (group.some((booking) => !(["PENDING", "CONFIRMED"] as const).includes(booking.bookingStatus as "PENDING" | "CONFIRMED"))) {
        throw new Error("SPA_DEMO_STATUS_INVALID");
      }
      if (group.some((booking) => Number(booking.notes?.match(/\|party=(\d+)/)?.[1] ?? 1) !== partySize)) {
        throw new Error("SPA_DEMO_GROUP_INCOMPLETE");
      }

      const amount = group.reduce((total, booking) => total + Number(booking.treatmentPriceSnapshot ?? 0), 0);
      const leader = group.find((booking) => booking.id === SPA_DEMO_LIVE_FLOW_BOOKING_IDS[0]) ?? group[0];
      if (!leader?.serviceStaffId || amount <= 0) throw new Error("SPA_DEMO_GROUP_INCOMPLETE");

      let storedValueBalance: number | null = null;
      let packageRemainingSessions: number | null = null;
      const transactionId = parsed.data.settlement === "STORED_VALUE"
        ? SPA_DEMO_LIVE_FLOW_STORED_TRANSACTION_ID
        : parsed.data.settlement === "PACKAGE"
          ? SPA_DEMO_LIVE_FLOW_PACKAGE_TRANSACTION_ID
          : SPA_DEMO_LIVE_FLOW_TRANSACTION_ID;

      if (parsed.data.settlement === "STORED_VALUE") {
        const wallet = await tx.storedValueWallet.findFirst({
          where: { storeId: SPA_DEMO_STORE.id, customerId: leader.customerId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!wallet) throw new Error("SPA_DEMO_STORED_WALLET_MISSING");
        await tx.$queryRaw`SELECT id FROM "StoredValueWallet" WHERE id = ${wallet.id} FOR UPDATE`;
        const locked = await tx.storedValueWallet.findUnique({ where: { id: wallet.id }, select: { balance: true } });
        const balance = Number(locked?.balance ?? 0);
        if (balance < amount) throw new Error("SPA_DEMO_STORED_VALUE_INSUFFICIENT");
        storedValueBalance = balance - amount;
        await tx.storedValueWallet.update({ where: { id: wallet.id }, data: { balance: storedValueBalance } });
      }

      if (parsed.data.settlement === "PACKAGE") {
        await tx.$queryRaw`SELECT id FROM "CustomerPlanWallet" WHERE id = ${SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID} FOR UPDATE`;
        const wallet = await tx.customerPlanWallet.findFirst({
          where: {
            id: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
            storeId: SPA_DEMO_STORE.id,
            customerId: leader.customerId,
            status: "ACTIVE",
            remainingSessions: { gte: partySize },
          },
          select: { id: true, remainingSessions: true },
        });
        if (!wallet) throw new Error("SPA_DEMO_PACKAGE_WALLET_EMPTY");
        const sessions = await tx.walletSession.findMany({
          where: { walletId: wallet.id, status: "AVAILABLE" },
          orderBy: { sessionNo: "asc" },
          take: partySize,
          select: { id: true },
        });
        if (sessions.length !== partySize) throw new Error("SPA_DEMO_PACKAGE_SESSION_EMPTY");
        for (const [index, session] of sessions.entries()) {
          const reserved = await tx.walletSession.updateMany({
            where: { id: session.id, status: "AVAILABLE" },
            data: { status: "RESERVED", bookingId: group[index].id, reservedAt: new Date() },
          });
          if (reserved.count !== 1) throw new Error("SPA_DEMO_PACKAGE_SESSION_CONFLICT");
          await tx.walletSession.update({
            where: { id: session.id },
            data: { status: "COMPLETED", completedAt: new Date() },
          });
        }
        packageRemainingSessions = wallet.remainingSessions - partySize;
        await tx.customerPlanWallet.update({
          where: { id: wallet.id },
          data: {
            remainingSessions: packageRemainingSessions,
            status: packageRemainingSessions === 0 ? "USED_UP" : "ACTIVE",
          },
        });
      }

      await tx.transaction.create({
        data: {
          id: parsed.data.settlement === "STORED_VALUE"
            ? SPA_DEMO_LIVE_FLOW_STORED_TRANSACTION_ID
            : parsed.data.settlement === "PACKAGE"
              ? SPA_DEMO_LIVE_FLOW_PACKAGE_TRANSACTION_ID
              : SPA_DEMO_LIVE_FLOW_TRANSACTION_ID,
          customerId: leader.customerId,
          storeId: SPA_DEMO_STORE.id,
          bookingId: leader.id,
          revenueStaffId: leader.revenueStaffId ?? leader.serviceStaffId,
          serviceStaffId: leader.serviceStaffId,
          ...(parsed.data.settlement === "PACKAGE" ? {
            customerPlanWalletId: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
            planId: SPA_DEMO_LIVE_FLOW_PACKAGE_PLAN_ID,
          } : {}),
          transactionType: parsed.data.settlement === "PACKAGE" ? "SESSION_DEDUCTION" : "SINGLE_PURCHASE",
          paymentMethod: PAYMENT_METHOD[parsed.data.settlement],
          paymentStatus: "SUCCESS",
          paidAt: new Date(),
          amount: parsed.data.settlement === "PACKAGE" ? 0 : amount,
          netAmount: parsed.data.settlement === "PACKAGE" ? 0 : amount,
          quantity: partySize,
          note: `SPA Demo ${partySize} 位同行完成服務`,
        },
      });

      if (parsed.data.settlement === "STORED_VALUE") {
        const wallet = await tx.storedValueWallet.findFirst({
          where: { storeId: SPA_DEMO_STORE.id, customerId: leader.customerId },
          select: { id: true },
        });
        if (!wallet || storedValueBalance === null) throw new Error("SPA_DEMO_STORED_WALLET_MISSING");
        await tx.storedValueLedgerEntry.create({
          data: {
            id: SPA_DEMO_LIVE_FLOW_STORED_LEDGER_ID,
            walletId: wallet.id,
            storeId: SPA_DEMO_STORE.id,
            customerId: leader.customerId,
            bookingId: leader.id,
            transactionId,
            entryType: "DEBIT",
            amount: -amount,
            balanceAfter: storedValueBalance,
            note: `${partySize} 位同行服務`,
          },
        });
      }

      const label = parsed.data.settlement === "PACKAGE"
        ? `扣療程 ${partySize} 次`
        : SETTLEMENT_LABEL[parsed.data.settlement];
      for (const [index, booking] of group.entries()) {
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            bookingStatus: "COMPLETED",
            ...(parsed.data.settlement === "PACKAGE" ? {
              bookingType: "PACKAGE_SESSION",
              servicePlanId: SPA_DEMO_LIVE_FLOW_PACKAGE_PLAN_ID,
              customerPlanWalletId: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
            } : {}),
            notes: `SPA_DEMO_LIVE_FLOW|party=${partySize}|guest=${index + 1}|checkout=GROUP|settlement=${parsed.data.settlement}|label=${label}|amount=${parsed.data.settlement === "PACKAGE" ? 0 : amount}`,
          },
        });
      }

      return {
        bookingIds: group.map((booking) => booking.id),
        storedValueBalance,
        packageRemainingSessions,
        amount: parsed.data.settlement === "PACKAGE" ? 0 : amount,
      };
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SPA_DEMO_STORED_VALUE_INSUFFICIENT") return { success: false as const, error: "儲值金餘額不足，整組尚未結帳" };
    if (message === "SPA_DEMO_PACKAGE_WALLET_EMPTY" || message === "SPA_DEMO_PACKAGE_SESSION_EMPTY") return { success: false as const, error: "療程剩餘次數不足，整組尚未扣次" };
    if (message === "SPA_DEMO_ALREADY_COMPLETED") return { success: false as const, error: "此組服務已完成，請勿重複結帳" };
    if (message === "SPA_DEMO_GROUP_INCOMPLETE") return { success: false as const, error: "同行預約資料不完整，整組未變更" };
    if (message === "SPA_DEMO_STATUS_INVALID") return { success: false as const, error: "同行預約狀態不一致，整組未變更" };
    return { success: false as const, error: "目前無法完成結帳，請重新整理後再試" };
  }

  const settlementLabel = parsed.data.settlement === "PACKAGE"
    ? `扣療程 ${partySize} 次`
    : SETTLEMENT_LABEL[parsed.data.settlement];
  revalidatePath("/liff/design-preview");
  revalidatePath("/liff/manager-preview");
  revalidatePath("/liff/staff-preview");
  revalidatePath("/dashboard/spa-schedule");
  revalidatePath("/staff-schedule");
  return {
    success: true as const,
    data: { ...result, settlementLabel, people: partySize },
  };
}

export async function completeSpaDemoGuestBooking(input: unknown) {
  if (process.env.VERCEL_ENV === "production") {
    return { success: false as const, error: "Demo 結帳不在正式站開放" };
  }
  const parsed = guestInputSchema.safeParse(input);
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
      notes: true,
      customer: { select: { storeId: true } },
      serviceStaff: { select: { storeId: true } },
    },
  });
  if (!booking || booking.customer.storeId !== SPA_DEMO_STORE.id || booking.serviceStaff?.storeId !== SPA_DEMO_STORE.id || !booking.serviceStaffId) {
    return { success: false as const, error: "Demo 預約不存在或資料隔離檢查失敗" };
  }
  const partySize = Number(booking.notes?.match(/\|party=(\d+)/)?.[1] ?? 1);
  const guestIndex = Number(booking.notes?.match(/\|guest=(\d+)/)?.[1] ?? 1);
  if (!Number.isInteger(partySize) || !Number.isInteger(guestIndex) || guestIndex < 1 || guestIndex > partySize) {
    return { success: false as const, error: "同行預約資料不完整" };
  }
  if (guestIndex > 1 && (parsed.data.settlement === "STORED_VALUE" || parsed.data.settlement === "PACKAGE")) {
    return { success: false as const, error: "同行者尚未連結會員，請改用現金或刷卡" };
  }

  const transactionId = `spa-demo-transaction-live-split-${guestIndex}`;
  const ledgerId = `spa-demo-ledger-live-split-${guestIndex}`;
  const amount = Number(booking.treatmentPriceSnapshot ?? 0);
  if (amount <= 0) return { success: false as const, error: "服務金額不正確" };

  let result: { storedValueBalance: number | null; packageRemainingSessions: number | null };
  try {
    result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${booking.id} FOR UPDATE`;
      const current = await tx.booking.findFirst({
        where: { id: booking.id, storeId: SPA_DEMO_STORE.id },
        select: { bookingStatus: true },
      });
      if (!current || current.bookingStatus === "COMPLETED") throw new Error("SPA_DEMO_ALREADY_COMPLETED");
      if (!(current.bookingStatus === "PENDING" || current.bookingStatus === "CONFIRMED")) throw new Error("SPA_DEMO_STATUS_INVALID");

      let storedValueBalance: number | null = null;
      let packageRemainingSessions: number | null = null;
      let walletId: string | null = null;
      if (parsed.data.settlement === "STORED_VALUE") {
        const wallet = await tx.storedValueWallet.findFirst({
          where: { storeId: SPA_DEMO_STORE.id, customerId: booking.customerId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!wallet) throw new Error("SPA_DEMO_STORED_WALLET_MISSING");
        walletId = wallet.id;
        await tx.$queryRaw`SELECT id FROM "StoredValueWallet" WHERE id = ${wallet.id} FOR UPDATE`;
        const locked = await tx.storedValueWallet.findUnique({ where: { id: wallet.id }, select: { balance: true } });
        const balance = Number(locked?.balance ?? 0);
        if (balance < amount) throw new Error("SPA_DEMO_STORED_VALUE_INSUFFICIENT");
        storedValueBalance = balance - amount;
        await tx.storedValueWallet.update({ where: { id: wallet.id }, data: { balance: storedValueBalance } });
      }

      if (parsed.data.settlement === "PACKAGE") {
        await tx.$queryRaw`SELECT id FROM "CustomerPlanWallet" WHERE id = ${SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID} FOR UPDATE`;
        const wallet = await tx.customerPlanWallet.findFirst({
          where: {
            id: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
            storeId: SPA_DEMO_STORE.id,
            customerId: booking.customerId,
            status: "ACTIVE",
            remainingSessions: { gte: 1 },
          },
          select: { id: true, remainingSessions: true },
        });
        if (!wallet) throw new Error("SPA_DEMO_PACKAGE_WALLET_EMPTY");
        const session = await tx.walletSession.findFirst({
          where: { walletId: wallet.id, status: "AVAILABLE" },
          orderBy: { sessionNo: "asc" },
          select: { id: true },
        });
        if (!session) throw new Error("SPA_DEMO_PACKAGE_SESSION_EMPTY");
        const reserved = await tx.walletSession.updateMany({
          where: { id: session.id, status: "AVAILABLE" },
          data: { status: "RESERVED", bookingId: booking.id, reservedAt: new Date() },
        });
        if (reserved.count !== 1) throw new Error("SPA_DEMO_PACKAGE_SESSION_CONFLICT");
        await tx.walletSession.update({ where: { id: session.id }, data: { status: "COMPLETED", completedAt: new Date() } });
        packageRemainingSessions = wallet.remainingSessions - 1;
        await tx.customerPlanWallet.update({
          where: { id: wallet.id },
          data: { remainingSessions: packageRemainingSessions, status: packageRemainingSessions === 0 ? "USED_UP" : "ACTIVE" },
        });
      }

      await tx.transaction.create({
        data: {
          id: transactionId,
          customerId: booking.customerId,
          storeId: SPA_DEMO_STORE.id,
          bookingId: booking.id,
          revenueStaffId: booking.revenueStaffId ?? booking.serviceStaffId!,
          serviceStaffId: booking.serviceStaffId,
          ...(parsed.data.settlement === "PACKAGE" ? {
            customerPlanWalletId: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
            planId: SPA_DEMO_LIVE_FLOW_PACKAGE_PLAN_ID,
          } : {}),
          transactionType: parsed.data.settlement === "PACKAGE" ? "SESSION_DEDUCTION" : "SINGLE_PURCHASE",
          paymentMethod: PAYMENT_METHOD[parsed.data.settlement],
          paymentStatus: "SUCCESS",
          paidAt: new Date(),
          amount: parsed.data.settlement === "PACKAGE" ? 0 : amount,
          netAmount: parsed.data.settlement === "PACKAGE" ? 0 : amount,
          quantity: 1,
          note: `SPA Demo 同行者 ${guestIndex} 完成服務`,
        },
      });

      if (parsed.data.settlement === "STORED_VALUE") {
        if (!walletId || storedValueBalance === null) throw new Error("SPA_DEMO_STORED_WALLET_MISSING");
        await tx.storedValueLedgerEntry.create({
          data: {
            id: ledgerId,
            walletId,
            storeId: SPA_DEMO_STORE.id,
            customerId: booking.customerId,
            bookingId: booking.id,
            transactionId,
            entryType: "DEBIT",
            amount: -amount,
            balanceAfter: storedValueBalance,
            note: `同行者 ${guestIndex} 服務`,
          },
        });
      }

      const label = parsed.data.settlement === "PACKAGE" ? "扣療程 1 次" : SETTLEMENT_LABEL[parsed.data.settlement];
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          bookingStatus: "COMPLETED",
          ...(parsed.data.settlement === "PACKAGE" ? {
            bookingType: "PACKAGE_SESSION",
            servicePlanId: SPA_DEMO_LIVE_FLOW_PACKAGE_PLAN_ID,
            customerPlanWalletId: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
          } : {}),
          notes: `SPA_DEMO_LIVE_FLOW|party=${partySize}|guest=${guestIndex}|checkout=INDIVIDUAL|settlement=${parsed.data.settlement}|label=${label}|amount=${parsed.data.settlement === "PACKAGE" ? 0 : amount}`,
        },
      });
      return { storedValueBalance, packageRemainingSessions };
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SPA_DEMO_STORED_VALUE_INSUFFICIENT") return { success: false as const, error: "儲值金餘額不足，此位尚未結帳" };
    if (message === "SPA_DEMO_PACKAGE_WALLET_EMPTY" || message === "SPA_DEMO_PACKAGE_SESSION_EMPTY") return { success: false as const, error: "療程剩餘次數不足，此位尚未扣次" };
    if (message === "SPA_DEMO_ALREADY_COMPLETED") return { success: false as const, error: "此位已完成，請勿重複結帳" };
    return { success: false as const, error: "目前無法完成此位結帳，請重新整理後再試" };
  }

  const settlementLabel = parsed.data.settlement === "PACKAGE" ? "扣療程 1 次" : SETTLEMENT_LABEL[parsed.data.settlement];
  revalidatePath("/liff/design-preview");
  revalidatePath("/liff/manager-preview");
  revalidatePath("/liff/staff-preview");
  revalidatePath("/dashboard/spa-schedule");
  revalidatePath("/staff-schedule");
  return {
    success: true as const,
    data: {
      bookingId: booking.id,
      settlementLabel,
      amount: parsed.data.settlement === "PACKAGE" ? 0 : amount,
      ...result,
    },
  };
}
