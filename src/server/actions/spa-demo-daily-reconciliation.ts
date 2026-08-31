"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { buildSpaDailySummary } from "@/lib/spa-daily-summary";
import { SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { getSpaDemoPreviewData } from "@/server/queries/spa-demo-preview";

const inputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function confirmSpaDemoDailyReconciliation(input: unknown) {
  if (process.env.VERCEL_ENV === "production") {
    return { success: false as const, error: "Demo 帳務核對不在正式站開放" };
  }

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
