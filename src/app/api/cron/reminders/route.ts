import { NextRequest, NextResponse } from "next/server";
import { runReminders } from "@/server/reminder-engine";
import { computeStoreSummary, computeRevenueByCategory } from "@/server/queries/report-compute";
import { upsertReportSnapshot } from "@/server/queries/report-snapshot";
import { toLocalDateStr } from "@/lib/date-utils";
import { prisma } from "@/lib/db";
import { getAllActiveStoreIds } from "@/lib/store";

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

  // ── 2. Report snapshot pre-compute (all stores) ──
  try {
    const today = toLocalDateStr();
    const prevMonth = getPreviousMonth(today);
    const storeIds = await getAllActiveStoreIds();
    console.log(`[Cron] Computing report snapshots for ${prevMonth} across ${storeIds.length} store(s)...`);

    for (const sid of storeIds) {
      const [storeSummary, revenueByCategory] = await Promise.all([
        computeStoreSummary(prevMonth, sid),
        computeRevenueByCategory(prevMonth, sid),
      ]);

      await Promise.all([
        upsertReportSnapshot(sid, prevMonth, "STORE_SUMMARY", storeSummary),
        upsertReportSnapshot(sid, prevMonth, "REVENUE_BY_CATEGORY", revenueByCategory),
      ]);
    }

    console.log(`[Cron] Report snapshots for ${prevMonth} saved (${storeIds.length} stores)`);
    results.reportSnapshot = { month: prevMonth, stores: storeIds.length, status: "ok" };
  } catch (error) {
    console.error("[Cron] Report snapshot error:", error);
    results.reportSnapshot = { error: error instanceof Error ? error.message : "Unknown error" };
  }

  // ── 3. Scheduled downgrades ──
  try {
    const { processScheduledDowngrades } = await import("@/server/actions/upgrade-request");
    console.log("[Cron] Processing scheduled downgrades...");
    const downgradeResult = await processScheduledDowngrades();
    console.log(`[Cron] Downgrades: ${downgradeResult.processed} processed, ${downgradeResult.errors.length} errors`);
    results.downgrades = downgradeResult;
  } catch (error) {
    console.error("[Cron] Downgrade error:", error);
    results.downgrades = { error: error instanceof Error ? error.message : "Unknown error" };
  }

  // ── 4. Expired trials ──
  try {
    const { processExpiredTrials } = await import("@/server/actions/upgrade-request");
    console.log("[Cron] Processing expired trials...");
    const trialResult = await processExpiredTrials();
    console.log(`[Cron] Trials: ${trialResult.processed} processed, ${trialResult.errors.length} errors`);
    results.expiredTrials = trialResult;
  } catch (error) {
    console.error("[Cron] Trial expiry error:", error);
    results.expiredTrials = { error: error instanceof Error ? error.message : "Unknown error" };
  }

  // ── 5. ErrorLog cleanup (30 days) ──
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const deleted = await prisma.errorLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    console.log(`[Cron] ErrorLog cleanup: ${deleted.count} old records deleted`);
    results.errorLogCleanup = { deleted: deleted.count };
  } catch (error) {
    console.error("[Cron] ErrorLog cleanup error:", error);
    results.errorLogCleanup = { error: error instanceof Error ? error.message : "Unknown" };
  }

  return NextResponse.json({ ok: true, ...results });
}

function getPreviousMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  return `${prevY}-${String(prevM).padStart(2, "0")}`;
}
