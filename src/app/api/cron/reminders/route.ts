import { NextRequest, NextResponse } from "next/server";
import { runReminders } from "@/server/reminder-engine";
import { computeStoreSummary, computeRevenueByCategory } from "@/server/queries/report-compute";
import { upsertReportSnapshot } from "@/server/queries/report-snapshot";
import { toLocalDateStr } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

/**
 * 每日 Cron Job（UTC 01:00 = 台灣 09:00）
 *
 * 1. 執行提醒引擎
 * 2. Pre-compute 上月報表快照（僅在每月 1~3 號 or 上月無快照時）
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  // ── 1. Reminders ──
  try {
    console.log("[Cron] Running reminders...");
    const result = await runReminders();
    console.log(`[Cron] Done: ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed`);
    results.reminders = result;
  } catch (error) {
    console.error("[Cron] Reminder error:", error);
    results.reminders = { error: error instanceof Error ? error.message : "Unknown error" };
  }

  // ── 2. Report snapshot pre-compute ──
  try {
    const today = toLocalDateStr(); // "2026-04-10"
    const prevMonth = getPreviousMonth(today);
    console.log(`[Cron] Computing report snapshot for ${prevMonth}...`);

    const [storeSummary, revenueByCategory] = await Promise.all([
      computeStoreSummary(prevMonth),
      computeRevenueByCategory(prevMonth),
    ]);

    await Promise.all([
      upsertReportSnapshot(prevMonth, "STORE_SUMMARY", storeSummary),
      upsertReportSnapshot(prevMonth, "REVENUE_BY_CATEGORY", revenueByCategory),
    ]);

    console.log(`[Cron] Report snapshot for ${prevMonth} saved`);
    results.reportSnapshot = { month: prevMonth, status: "ok" };
  } catch (error) {
    console.error("[Cron] Report snapshot error:", error);
    results.reportSnapshot = { error: error instanceof Error ? error.message : "Unknown error" };
  }

  return NextResponse.json({ ok: true, ...results });
}

function getPreviousMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  return `${prevY}-${String(prevM).padStart(2, "0")}`;
}
