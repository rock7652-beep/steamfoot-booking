"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { buildSpaDailySummary } from "@/lib/spa-daily-summary";
import { SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { getSpaDemoPreviewData } from "@/server/queries/spa-demo-preview";
import { requireSpaStore } from "@/lib/industry-module-server";

const inputSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const adjustmentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bookingIds: z.array(z.string()).min(1).max(3),
  settlement: z.enum(["CASH", "CREDIT_CARD"]),
  amount: z.number().int().positive().max(100_000),
  reason: z.string().trim().min(2).max(80),
});

const LABEL = { CASH: "現金", CREDIT_CARD: "刷卡" } as const;

export async function confirmSpaDemoDailyReconciliation(input: unknown) {
  if (process.env.VERCEL_ENV === "production") return { success: false as const, error: "Demo 帳務核對不在正式站開放" };
  await requireSpaStore(SPA_DEMO_STORE.id);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "日期格式不正確" };

  const preview = await getSpaDemoPreviewData();
  const summary = buildSpaDailySummary(preview.bookings.filter((booking) => booking.date === parsed.data.date), preview.providers);
  if (summary.reconciliationStatus !== "READY") return { success: false as const, error: "當日仍有未完成或未記錄的帳務" };

  const existing = await prisma.reconciliationRun.findFirst({
    where: { storeId: SPA_DEMO_STORE.id, triggeredBy: "spa_demo_manager", targetDate: parsed.data.date, status: "pass" },
    select: { id: true },
  });
  if (!existing) {
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
        finishedAt: new Date(),
        checks: {
          create: [
            { checkCode: "spa_daily_service_completion", checkName: "服務完成", status: "pass", sources: { bookingCount: summary.bookingCount, completedCount: summary.completedCount }, expected: `${summary.bookingCount} 位皆已完成`, debugPayload: { pendingCount: summary.pendingCount, source: "SpaBooking" } },
            { checkCode: "spa_daily_payment_recorded", checkName: "付款記錄", status: "pass", sources: { groupCount: summary.groups.length, unsettledGroupCount: summary.unsettledGroupCount, unrecordedPaymentCount: summary.unrecordedPaymentCount }, expected: "所有完成服務皆有付款方式", debugPayload: { paymentMethods: summary.payments.map((payment) => payment.method), source: "SpaPayment" } },
            { checkCode: "spa_daily_received_amount", checkName: "當日實收", status: "pass", sources: { expectedAmount: summary.expectedAmount, paidAmount: summary.paidAmount }, expected: `NT$${summary.paidAmount}`, debugPayload: { payments: summary.payments, source: "SpaPayment" } },
          ],
        },
      },
    });
  }
  revalidatePath("/liff/manager-preview");
  return { success: true as const, data: { date: parsed.data.date } };
}

function allocate(total: number, weights: readonly number[]) {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  let used = 0;
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return total - used;
    const part = Math.round(total * weight / weightTotal);
    used += part;
    return part;
  });
}

export async function adjustSpaDemoDailySettlement(input: unknown) {
  if (process.env.VERCEL_ENV === "production") return { success: false as const, error: "Demo 帳務更正不在正式站開放" };
  await requireSpaStore(SPA_DEMO_STORE.id);
  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "帳務更正資料不完整" };
  const bookingIds = [...new Set(parsed.data.bookingIds)];
  if (bookingIds.length !== parsed.data.bookingIds.length) return { success: false as const, error: "帳務更正資料重複" };

  try {
    const snapshot = await spaPrisma.spaBooking.findMany({
      where: { id: { in: bookingIds }, storeId: SPA_DEMO_STORE.id, status: "COMPLETED" },
      include: { payments: { where: { refundOfPaymentId: null }, take: 1 } },
      orderBy: { guestIndex: "asc" },
    });
    if (snapshot.length !== bookingIds.length || snapshot.some((booking) => booking.payments.length !== 1)) {
      throw new Error("SPA_DEMO_ADJUSTMENT_TRANSACTION_MISMATCH");
    }
    const first = snapshot[0];
    const targetDate = first.bookingDate.toISOString().slice(0, 10);
    if (targetDate !== parsed.data.date || snapshot.some((booking) => booking.bookingDate.toISOString().slice(0, 10) !== targetDate || booking.startTime !== first.startTime || booking.customerId !== first.customerId)) {
      throw new Error("SPA_DEMO_ADJUSTMENT_GROUP_MISMATCH");
    }
    const originals = snapshot.map((booking) => booking.payments[0]);
    if (originals.some((payment) => !(["CASH", "CREDIT_CARD"] as const).includes(payment.paymentMethod as "CASH" | "CREDIT_CARD") || payment.status !== "SUCCESS")) {
      throw new Error("SPA_DEMO_ADJUSTMENT_UNSUPPORTED_SETTLEMENT");
    }
    const beforeMethod = originals.every((payment) => payment.paymentMethod === originals[0].paymentMethod) ? LABEL[originals[0].paymentMethod as "CASH" | "CREDIT_CARD"] : "混合付款";
    const beforeAmount = originals.reduce((sum, payment) => sum + Number(payment.netAmount), 0);
    const allocations = allocate(parsed.data.amount, snapshot.map((booking) => Number(booking.totalPriceSnapshot)));
    const adjustedAt = new Date();

    await spaPrisma.$transaction(async (tx) => {
      for (const [index, booking] of snapshot.entries()) {
        await tx.$queryRaw`SELECT id FROM "SpaPayment" WHERE id = ${originals[index].id} FOR UPDATE`;
        await tx.spaPayment.update({
          where: { id: originals[index].id },
          data: { paymentMethod: parsed.data.settlement, netAmount: allocations[index], note: `${originals[index].note ?? "SPA Demo 結帳"}｜帳務更正：${parsed.data.reason}` },
        });
        const party = Number(booking.notes?.match(/\|party=(\d+)/)?.[1] ?? snapshot.length);
        await tx.spaBooking.update({
          where: { id: booking.id },
          data: { notes: `SPA_DEMO_LIVE_FLOW|party=${party}|guest=${booking.guestIndex}|checkout=${bookingIds.length > 1 ? "GROUP" : "INDIVIDUAL"}|settlement=${parsed.data.settlement}|label=${LABEL[parsed.data.settlement]}|amount=${allocations[index]}` },
        });
      }
    });

    const customer = await prisma.customer.findFirst({ where: { id: first.customerId, storeId: SPA_DEMO_STORE.id }, select: { name: true } });
    if (!customer) throw new Error("SPA_DEMO_ADJUSTMENT_ISOLATION_FAILED");
    await prisma.reconciliationRun.updateMany({
      where: { storeId: SPA_DEMO_STORE.id, triggeredBy: "spa_demo_manager", targetDate, status: "pass" },
      data: { status: "mismatch", mismatchCount: 1, passCount: 2 },
    });
    await prisma.reconciliationRun.create({
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
        checks: { create: [{ checkCode: "spa_daily_settlement_adjustment", checkName: "帳務更正", status: "pass", sources: { before: { method: beforeMethod, amount: beforeAmount }, after: { method: LABEL[parsed.data.settlement], amount: parsed.data.amount } }, expected: parsed.data.reason, debugPayload: { bookingIds, customer: customer.name, slotTime: first.startTime, adjustedBy: "spa_demo_manager", reason: parsed.data.reason, source: "SpaPayment" } }] },
      },
    });

    const result = { date: targetDate, bookingIds, beforeMethod, beforeAmount, afterMethod: LABEL[parsed.data.settlement], afterAmount: parsed.data.amount, reason: parsed.data.reason, customer: customer.name, time: first.startTime, adjustedBy: "店長", adjustedAt: adjustedAt.toISOString(), settlementScope: bookingIds.length > 1 ? "GROUP" as const : "INDIVIDUAL" as const };
    revalidatePath("/liff/manager-preview");
    return { success: true as const, data: result };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SPA_DEMO_ADJUSTMENT_UNSUPPORTED_SETTLEMENT") return { success: false as const, error: "儲值金與扣療程請先撤銷原扣抵" };
    if (message === "SPA_DEMO_ADJUSTMENT_TRANSACTION_MISMATCH") return { success: false as const, error: "原交易資料不一致，未進行更正" };
    return { success: false as const, error: "目前無法更正帳務，請重新整理後再試" };
  }
}
