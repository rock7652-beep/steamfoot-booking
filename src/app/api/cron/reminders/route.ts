import { NextRequest, NextResponse } from "next/server";
import { runReminders } from "@/server/reminder-engine";
import { computeStoreSummary, computeRevenueByCategory } from "@/server/queries/report-compute";
import { upsertReportSnapshot } from "@/server/queries/report-snapshot";
import { toLocalDateStr } from "@/lib/date-utils";
import { prisma } from "@/lib/db";
import { getAllActiveStoreIds } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * 每日 Cron Job（UTC 10:00 = 台灣 18:00）
 *
 * 1. 提醒引擎 — 發送「明天 (TW)」的所有有效預約提醒
 * 2. Pre-compute 上月報表快照
 * 3. 處理排程降級
 * 4. 處理試用到期
 * 5. ErrorLog 清理
 *
 * 為何 18:00 而非 09:00：Vercel Hobby plan 不支援分鐘級 cron（每 30 分鐘會被拒絕），
 * 改用 daily next-day batch 發提醒，挑 18:00 顧客比較會看 LINE 的時段。
 *
 * 認證：要求 `Authorization: Bearer ${CRON_SECRET}`，未設定時拒絕（避免外部任意觸發）。
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[Cron] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  // ── 1. Reminders (next-day batch) ──
  try {
    console.log("[Cron] Running next-day reminders...");
    const reminderResult = await runReminders();
    console.log(
      `[Cron] Reminders: ${reminderResult.sent} sent, ${reminderResult.skipped} skipped, ${reminderResult.failed} failed`,
    );
    results.reminders = reminderResult;
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

  // 任一子任務在 results 寫入 { error } 代表該批次「整個拋出」（例：runReminders()
  // 在第一個 Prisma query 就因 stale DATABASE_URL build-time snapshot 連線失敗）。
  // 這類 infra 失敗過去被各自的 try/catch swallow 後，整體仍回 200，導致 Vercel
  // cron run history 顯示成功、提醒實際停擺數天無人察覺（2026-05-16 事故）。
  // 失敗不可假裝成功 → 只要有任一任務拋出就回 500，讓 cron run history 直接看得出。
  //
  // 注意分界：runReminders() 內部對「個別 LINE 發送失敗」已自行處理並回
  // { failed: N }（不寫 error），那是正常營運狀態，不在此視為批次失敗，仍回 200。
  // 唯有任務「整個 throw」才會在 results 留下 error 鍵 → 才算 500。
  const failedTasks = Object.entries(results)
    .filter(([, v]) => v != null && typeof v === "object" && "error" in v)
    .map(([k]) => k);

  if (failedTasks.length > 0) {
    console.error(`[Cron] FAILED tasks: ${failedTasks.join(", ")}`);
    return NextResponse.json({ ok: false, failedTasks, ...results }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...results });
}

function getPreviousMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  return `${prevY}-${String(prevM).padStart(2, "0")}`;
}
