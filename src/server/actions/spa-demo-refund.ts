"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  SPA_DEMO_LIVE_FLOW_BOOKING_IDS,
  SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
  SPA_DEMO_STORE,
} from "@/lib/spa-demo-store";

const inputSchema = z.object({
  bookingId: z.enum(SPA_DEMO_LIVE_FLOW_BOOKING_IDS),
  scope: z.enum(["GROUP", "GUEST"]),
  reason: z.string().trim().min(2).max(80),
});

type RefundableSettlement = "CASH" | "CREDIT_CARD" | "STORED_VALUE" | "PACKAGE";

function parseBookingNotes(notes: string | null) {
  const read = (key: string) => notes?.match(new RegExp(`\\|${key}=([^|]+)`))?.[1] ?? "";
  return {
    party: Number(read("party") || 1),
    guest: Number(read("guest") || 1),
    checkout: read("checkout") as "GROUP" | "INDIVIDUAL",
    settlement: read("settlement") as RefundableSettlement,
    label: read("label"),
    amount: Number(read("amount") || 0),
    refunded: read("refund") === "REFUNDED",
  };
}

function allocateGroupAmounts(total: number, prices: readonly number[]): number[] {
  const priceTotal = prices.reduce((sum, price) => sum + price, 0);
  if (priceTotal <= 0) return prices.map(() => 0);
  let allocated = 0;
  return prices.map((price, index) => {
    if (index === prices.length - 1) return total - allocated;
    const amount = Math.round(total * price / priceTotal);
    allocated += amount;
    return amount;
  });
}

function revalidateSpaDemo() {
  revalidatePath("/liff/design-preview");
  revalidatePath("/liff/manager-preview");
  revalidatePath("/liff/staff-preview");
}

export async function refundSpaDemoCheckout(input: unknown) {
  if (process.env.VERCEL_ENV === "production") {
    return { success: false as const, error: "Demo 退款不在正式站開放" };
  }
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "退款資料不完整" };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const selected = await tx.booking.findFirst({
        where: { id: parsed.data.bookingId, storeId: SPA_DEMO_STORE.id, bookingStatus: "COMPLETED" },
        select: {
          id: true,
          bookingDate: true,
          slotTime: true,
          customerId: true,
          notes: true,
          treatmentPriceSnapshot: true,
          customer: { select: { name: true, storeId: true } },
          serviceStaff: { select: { storeId: true } },
        },
      });
      if (!selected || selected.customer.storeId !== SPA_DEMO_STORE.id || selected.serviceStaff?.storeId !== SPA_DEMO_STORE.id) {
        throw new Error("SPA_DEMO_REFUND_ISOLATION_FAILED");
      }

      const selectedMeta = parseBookingNotes(selected.notes);
      if (!Number.isInteger(selectedMeta.party) || selectedMeta.party < 1 || selectedMeta.party > SPA_DEMO_LIVE_FLOW_BOOKING_IDS.length) {
        throw new Error("SPA_DEMO_REFUND_GROUP_INVALID");
      }
      const expectedIds = [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS.slice(0, selectedMeta.party)];
      const targetIds = parsed.data.scope === "GROUP" ? expectedIds : [selected.id];
      for (const bookingId of targetIds) {
        await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
      }

      const group = await tx.booking.findMany({
        where: {
          id: { in: expectedIds },
          storeId: SPA_DEMO_STORE.id,
          customerId: selected.customerId,
          bookingDate: selected.bookingDate,
          slotTime: selected.slotTime,
          bookingStatus: "COMPLETED",
        },
        select: {
          id: true,
          notes: true,
          treatmentPriceSnapshot: true,
          customerId: true,
          revenueStaffId: true,
          serviceStaffId: true,
        },
        orderBy: { id: "asc" },
      });
      if (group.length !== expectedIds.length) throw new Error("SPA_DEMO_REFUND_GROUP_INVALID");

      const ordered = expectedIds.map((id) => group.find((booking) => booking.id === id)!);
      const metadata = ordered.map((booking) => parseBookingNotes(booking.notes));
      const targets = ordered.filter((booking) => targetIds.includes(booking.id));
      if (targets.some((booking) => parseBookingNotes(booking.notes).refunded)) {
        throw new Error("SPA_DEMO_ALREADY_REFUNDED");
      }
      if (metadata.some((meta) => !(["CASH", "CREDIT_CARD", "STORED_VALUE", "PACKAGE"] as const).includes(meta.settlement))) {
        throw new Error("SPA_DEMO_REFUND_SETTLEMENT_INVALID");
      }

      const originalTransactions = await tx.transaction.findMany({
        where: {
          storeId: SPA_DEMO_STORE.id,
          transactionType: { not: "REFUND" },
          status: "SUCCESS",
          bookingId: { in: metadata[0].checkout === "GROUP" ? [expectedIds[0]] : targetIds },
        },
        select: {
          id: true,
          bookingId: true,
          amount: true,
          paymentMethod: true,
          revenueStaffId: true,
          serviceStaffId: true,
          planId: true,
          customerPlanWalletId: true,
          transactionType: true,
        },
      });
      if (metadata[0].checkout === "GROUP" ? originalTransactions.length !== 1 : originalTransactions.length !== targets.length) {
        throw new Error("SPA_DEMO_REFUND_TRANSACTION_INVALID");
      }

      const prices = ordered.map((booking) => Number(booking.treatmentPriceSnapshot ?? 0));
      const groupOriginal = metadata[0].checkout === "GROUP" ? originalTransactions[0] : null;
      const allocated = groupOriginal
        ? allocateGroupAmounts(Number(groupOriginal.amount), prices)
        : prices;
      let storedValueBalance: number | null = null;
      let packageRemainingSessions: number | null = null;
      const refundedAt = new Date();
      const refunds: { bookingId: string; amount: number }[] = [];

      for (const booking of targets) {
        const index = ordered.findIndex((item) => item.id === booking.id);
        const meta = metadata[index];
        const original = groupOriginal ?? originalTransactions.find((transaction) => transaction.bookingId === booking.id);
        if (!original) throw new Error("SPA_DEMO_REFUND_TRANSACTION_INVALID");
        const amount = meta.settlement === "PACKAGE" ? 0 : groupOriginal ? allocated[index] : Number(original.amount);
        const refundId = `spa-demo-refund-${booking.id}`;
        const duplicate = await tx.transaction.findFirst({
          where: { id: refundId, storeId: SPA_DEMO_STORE.id, transactionType: "REFUND" },
          select: { id: true },
        });
        if (duplicate) throw new Error("SPA_DEMO_ALREADY_REFUNDED");

        await tx.transaction.create({
          data: {
            id: refundId,
            customerId: booking.customerId,
            storeId: SPA_DEMO_STORE.id,
            bookingId: booking.id,
            revenueStaffId: original.revenueStaffId,
            serviceStaffId: original.serviceStaffId,
            customerPlanWalletId: original.customerPlanWalletId,
            planId: original.planId,
            transactionType: "REFUND",
            paymentMethod: original.paymentMethod,
            paymentStatus: "SUCCESS",
            paidAt: refundedAt,
            transactionDate: selected.bookingDate,
            amount: -amount,
            netAmount: -amount,
            quantity: 1,
            status: "SUCCESS",
            refundOfTransactionId: original.id,
            refundReason: parsed.data.reason,
            refundedAt,
            note: `SPA Demo 退款｜${parsed.data.reason}`,
          },
        });

        if (meta.settlement === "PACKAGE") {
          const restored = await tx.walletSession.updateMany({
            where: {
              walletId: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
              bookingId: booking.id,
              status: "COMPLETED",
            },
            data: { status: "AVAILABLE", bookingId: null, reservedAt: null, completedAt: null },
          });
          if (restored.count !== 1) throw new Error("SPA_DEMO_REFUND_PACKAGE_INVALID");
        }

        await tx.booking.update({
          where: { id: booking.id },
          data: {
            notes: `SPA_DEMO_LIVE_FLOW|party=${meta.party}|guest=${meta.guest}|checkout=${meta.checkout}|settlement=${meta.settlement}|label=${meta.label}|amount=${meta.amount}|refund=REFUNDED|refundAmount=${amount}|refundReason=${parsed.data.reason}|refundedAt=${refundedAt.toISOString()}`,
          },
        });
        refunds.push({ bookingId: booking.id, amount });
      }

      const targetMetadata = targets.map((booking) => metadata[ordered.findIndex((item) => item.id === booking.id)]);
      const storedRefunds = refunds.filter((_, index) => targetMetadata[index].settlement === "STORED_VALUE");
      if (storedRefunds.length) {
        const wallet = await tx.storedValueWallet.findFirst({
          where: { storeId: SPA_DEMO_STORE.id, customerId: selected.customerId },
          select: { id: true },
        });
        if (!wallet) throw new Error("SPA_DEMO_REFUND_STORED_INVALID");
        await tx.$queryRaw`SELECT id FROM "StoredValueWallet" WHERE id = ${wallet.id} FOR UPDATE`;
        const current = await tx.storedValueWallet.findUnique({ where: { id: wallet.id }, select: { balance: true } });
        storedValueBalance = Number(current?.balance ?? 0);
        for (const refund of storedRefunds) {
          storedValueBalance += refund.amount;
          await tx.storedValueLedgerEntry.create({
            data: {
              id: `spa-demo-refund-ledger-${refund.bookingId}`,
              walletId: wallet.id,
              storeId: SPA_DEMO_STORE.id,
              customerId: selected.customerId,
              transactionId: `spa-demo-refund-${refund.bookingId}`,
              entryType: "CREDIT",
              amount: refund.amount,
              balanceAfter: storedValueBalance,
              note: `SPA Demo 退款｜${parsed.data.reason}`,
            },
          });
        }
        await tx.storedValueWallet.update({ where: { id: wallet.id }, data: { balance: storedValueBalance } });
      }

      if (targetMetadata.some((meta) => meta.settlement === "PACKAGE")) {
        const available = await tx.walletSession.count({
          where: { walletId: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID, status: "AVAILABLE" },
        });
        await tx.customerPlanWallet.update({
          where: { id: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID },
          data: { remainingSessions: available, status: "ACTIVE" },
        });
        packageRemainingSessions = available;
      }

      const targetDate = selected.bookingDate.toISOString().slice(0, 10);
      await tx.reconciliationRun.updateMany({
        where: { storeId: SPA_DEMO_STORE.id, triggeredBy: "spa_demo_manager", targetDate, status: "pass" },
        data: { status: "mismatch", mismatchCount: 1, passCount: 2 },
      });
      await tx.reconciliationRun.create({
        data: {
          storeId: SPA_DEMO_STORE.id,
          triggeredBy: "spa_demo_manager_refund",
          status: "pass",
          targetDate,
          targetMonth: targetDate.slice(0, 7),
          totalChecks: 1,
          passCount: 1,
          mismatchCount: 0,
          errorCount: 0,
          durationMs: 0,
          finishedAt: refundedAt,
          checks: {
            create: [{
              checkCode: "spa_daily_checkout_refund",
              checkName: "退款／作廢",
              status: "pass",
              sources: { bookingIds: targetIds, amounts: refunds.map((refund) => refund.amount) },
              expected: parsed.data.reason,
              debugPayload: {
                customer: selected.customer.name,
                slotTime: selected.slotTime,
                scope: parsed.data.scope,
                settlements: [...new Set(targetMetadata.map((meta) => meta.settlement))],
                refundedBy: "spa_demo_manager",
              },
            }],
          },
        },
      });

      return {
        date: targetDate,
        bookingIds: targetIds,
        refunds,
        refundAmount: refunds.reduce((sum, refund) => sum + refund.amount, 0),
        reason: parsed.data.reason,
        refundedAt: refundedAt.toISOString(),
        customer: selected.customer.name,
        time: selected.slotTime,
        scope: parsed.data.scope,
        settlements: [...new Set(targetMetadata.map((meta) => meta.settlement))],
        refundedBy: "店長",
        storedValueBalance,
        packageRemainingSessions,
      };
    });

    revalidateSpaDemo();
    return { success: true as const, data: result };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SPA_DEMO_ALREADY_REFUNDED") return { success: false as const, error: "這筆結帳已退款，請勿重複操作" };
    if (message === "SPA_DEMO_REFUND_PACKAGE_INVALID") return { success: false as const, error: "療程扣次資料不一致，整筆未變更" };
    if (message === "SPA_DEMO_REFUND_STORED_INVALID") return { success: false as const, error: "儲值金資料不一致，整筆未變更" };
    return { success: false as const, error: "目前無法退款，請重新整理後再試" };
  }
}
