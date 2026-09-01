"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { buildSpaDailySummary } from "@/lib/spa-daily-summary";
import { SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { getSpaDemoPreviewData } from "@/server/queries/spa-demo-preview";
import { requireSpaStore } from "@/lib/industry-module-server";

const inputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const adjustmentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bookingIds: z.array(z.string()).min(1).max(3),
  settlement: z.enum(["CASH", "CREDIT_CARD"]),
  amount: z.number().int().positive().max(100_000),
  reason: z.string().trim().min(2).max(80),
});

const ADJUSTMENT_LABEL = {
  CASH: "現金",
  CREDIT_CARD: "刷卡",
} as const;

const ADJUSTMENT_PAYMENT_METHOD = {
  CASH: "CASH",
  CREDIT_CARD: "CREDIT_CARD",
} as const;

function parseSettlement(notes: string | null) {
  const settlement = notes?.match(/\|settlement=([^|]+)/)?.[1] ?? "";
  const label = notes?.match(/\|label=([^|]+)/)?.[1] ?? "";
  const amount = Number(notes?.match(/\|amount=(\d+)/)?.[1] ?? Number.NaN);
  const party = Number(notes?.match(/\|party=(\d+)/)?.[1] ?? Number.NaN);
  const guest = Number(notes?.match(/\|guest=(\d+)/)?.[1] ?? Number.NaN);
  return { settlement, label, amount, party, guest };
}

export async function confirmSpaDemoDailyReconciliation(input: unknown) {
  if (process.env.VERCEL_ENV === "production") {
    return { success: false as const, error: "Demo 帳務核對不在正式站開放" };
  }
  await requireSpaStore(SPA_DEMO_STORE.id);

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "日期格式不正確" };

  const preview = await getSpaDemoPreviewData();
  const summary = buildSpaDailySummary(
    preview.bookings.filter((booking) => booking.date === parsed.data.date),
    preview.providers,
  );
  if (summary.reconciliationStatus !== "READY") {
    return { success: false as const, error: "當日仍有未完成或未記錄的帳務" };
  }

  const existing = await prisma.reconciliationRun.findFirst({
    where: {
      storeId: SPA_DEMO_STORE.id,
      triggeredBy: "spa_demo_manager",
      targetDate: parsed.data.date,
      status: "pass",
    },
    select: { id: true },
  });
  if (!existing) {
    const finishedAt = new Date();
    await prisma.reconciliationRun.create({
      data: {
        storeId: SPA_DEMO_STORE.id,
        triggeredBy: "spa_demo_manager",
        status: "pass",
        targetDate: parsed.data.date,
        targetMonth: parsed.data.date.slice(0, 7),
        totalChecks: 3,
        passCount: 3,
        mismatchCount: 0,
        errorCount: 0,
        durationMs: 0,
        finishedAt,
        checks: {
          create: [
            {
              checkCode: "spa_daily_service_completion",
              checkName: "服務完成",
              status: "pass",
              sources: { bookingCount: summary.bookingCount, completedCount: summary.completedCount },
              expected: `${summary.bookingCount} 位皆已完成`,
              debugPayload: { pendingCount: summary.pendingCount },
            },
            {
              checkCode: "spa_daily_payment_recorded",
              checkName: "付款記錄",
              status: "pass",
              sources: {
                groupCount: summary.groups.length,
                unsettledGroupCount: summary.unsettledGroupCount,
                unrecordedPaymentCount: summary.unrecordedPaymentCount,
              },
              expected: "所有完成服務皆有付款方式",
              debugPayload: { paymentMethods: summary.payments.map((payment) => payment.method) },
            },
            {
              checkCode: "spa_daily_received_amount",
              checkName: "當日實收",
              status: "pass",
              sources: { expectedAmount: summary.expectedAmount, paidAmount: summary.paidAmount },
              expected: `NT$${summary.paidAmount}`,
              debugPayload: { payments: summary.payments },
            },
          ],
        },
      },
    });
  }

  revalidatePath("/liff/manager-preview");
  return { success: true as const, data: { date: parsed.data.date } };
}

export async function adjustSpaDemoDailySettlement(input: unknown) {
  if (process.env.VERCEL_ENV === "production") {
    return { success: false as const, error: "Demo 帳務更正不在正式站開放" };
  }
  await requireSpaStore(SPA_DEMO_STORE.id);

  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "帳務更正資料不完整" };

  const uniqueBookingIds = [...new Set(parsed.data.bookingIds)];
  if (uniqueBookingIds.length !== parsed.data.bookingIds.length) {
    return { success: false as const, error: "帳務更正資料重複" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      for (const bookingId of uniqueBookingIds) {
        await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
      }

      const bookings = await tx.booking.findMany({
        where: {
          id: { in: uniqueBookingIds },
          storeId: SPA_DEMO_STORE.id,
          bookingStatus: "COMPLETED",
        },
        select: {
          id: true,
          bookingDate: true,
          slotTime: true,
          customerId: true,
          notes: true,
          customer: { select: { name: true, storeId: true } },
          serviceStaff: { select: { storeId: true } },
        },
        orderBy: { id: "asc" },
      });
      if (
        bookings.length !== uniqueBookingIds.length
        || bookings.some((booking) => booking.customer.storeId !== SPA_DEMO_STORE.id || booking.serviceStaff?.storeId !== SPA_DEMO_STORE.id)
      ) {
        throw new Error("SPA_DEMO_ADJUSTMENT_ISOLATION_FAILED");
      }

      const first = bookings[0];
      const targetDate = first.bookingDate.toISOString().slice(0, 10);
      if (
        targetDate !== parsed.data.date
        || bookings.some((booking) => (
          booking.bookingDate.toISOString().slice(0, 10) !== targetDate
          || booking.slotTime !== first.slotTime
          || booking.customerId !== first.customerId
        ))
      ) {
        throw new Error("SPA_DEMO_ADJUSTMENT_GROUP_MISMATCH");
      }

      const currentSettlements = bookings.map((booking) => parseSettlement(booking.notes));
      const before = currentSettlements[0];
      if (
        !["CASH", "CREDIT_CARD"].includes(before.settlement)
        || !Number.isFinite(before.amount)
        || currentSettlements.some((current) => current.settlement !== before.settlement || current.amount !== before.amount)
      ) {
        throw new Error("SPA_DEMO_ADJUSTMENT_UNSUPPORTED_SETTLEMENT");
      }

      const transactions = await tx.transaction.findMany({
        where: {
          storeId: SPA_DEMO_STORE.id,
          bookingId: { in: uniqueBookingIds },
          paymentStatus: "SUCCESS",
          status: "SUCCESS",
        },
        select: { id: true, bookingId: true, amount: true, note: true },
      });
      if (transactions.length !== 1) throw new Error("SPA_DEMO_ADJUSTMENT_TRANSACTION_MISMATCH");

      const label = ADJUSTMENT_LABEL[parsed.data.settlement];
      const adjustedAt = new Date();
      await tx.transaction.update({
        where: { id: transactions[0].id },
        data: {
          paymentMethod: ADJUSTMENT_PAYMENT_METHOD[parsed.data.settlement],
          amount: parsed.data.amount,
          netAmount: parsed.data.amount,
          note: `${transactions[0].note ?? "SPA Demo 結帳"}｜帳務更正：${parsed.data.reason}`,
        },
      });

      for (const [index, booking] of bookings.entries()) {
        const current = currentSettlements[index];
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            notes: `SPA_DEMO_LIVE_FLOW|party=${current.party}|guest=${current.guest}|checkout=${uniqueBookingIds.length > 1 ? "GROUP" : "INDIVIDUAL"}|settlement=${parsed.data.settlement}|label=${label}|amount=${parsed.data.amount}`,
          },
        });
      }

      await tx.reconciliationRun.updateMany({
        where: {
          storeId: SPA_DEMO_STORE.id,
          triggeredBy: "spa_demo_manager",
          targetDate,
          status: "pass",
        },
        data: { status: "mismatch", mismatchCount: 1, passCount: 2 },
      });

      await tx.reconciliationRun.create({
        data: {
          storeId: SPA_DEMO_STORE.id,
          triggeredBy: "spa_demo_manager_adjustment",
          status: "pass",
          targetDate,
          targetMonth: targetDate.slice(0, 7),
          totalChecks: 1,
          passCount: 1,
          mismatchCount: 0,
          errorCount: 0,
          durationMs: 0,
          finishedAt: adjustedAt,
          checks: {
            create: [{
              checkCode: "spa_daily_settlement_adjustment",
              checkName: "帳務更正",
              status: "pass",
              sources: {
                before: { method: before.label, amount: before.amount },
                after: { method: label, amount: parsed.data.amount },
              },
              expected: parsed.data.reason,
              debugPayload: {
                bookingIds: uniqueBookingIds,
                customer: first.customer.name,
                slotTime: first.slotTime,
                adjustedBy: "spa_demo_manager",
                reason: parsed.data.reason,
              },
            }],
          },
        },
      });

      return {
        date: targetDate,
        bookingIds: uniqueBookingIds,
        beforeMethod: before.label,
        beforeAmount: before.amount,
        afterMethod: label,
        afterAmount: parsed.data.amount,
        reason: parsed.data.reason,
        customer: first.customer.name,
        time: first.slotTime,
        adjustedBy: "店長",
        adjustedAt: adjustedAt.toISOString(),
        settlementScope: uniqueBookingIds.length > 1 ? "GROUP" as const : "INDIVIDUAL" as const,
      };
    });

    revalidatePath("/liff/manager-preview");
    return { success: true as const, data: result };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SPA_DEMO_ADJUSTMENT_UNSUPPORTED_SETTLEMENT") {
      return { success: false as const, error: "儲值金與扣療程請先撤銷原扣抵" };
    }
    if (message === "SPA_DEMO_ADJUSTMENT_TRANSACTION_MISMATCH") {
      return { success: false as const, error: "原交易資料不一致，未進行更正" };
    }
    return { success: false as const, error: "目前無法更正帳務，請重新整理後再試" };
  }
}
