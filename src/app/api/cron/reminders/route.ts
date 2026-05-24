import { NextRequest, NextResponse } from "next/server";
import { runReminders } from "@/server/reminder-engine";
import { computeStoreSummary, computeRevenueByCategory } from "@/server/queries/report-compute";
import { upsertReportSnapshot } from "@/server/queries/report-snapshot";
import { toLocalDateStr } from "@/lib/date-utils";
import { prisma } from "@/lib/db";
import { getAllActiveStoreIds } from "@/lib/store";
import { CronRunStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const CRON_JOB_NAME = "reminders";

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
 *
 * 可觀測性（PR-R1）：本 route 進場寫一筆 CronRunLog(status=STARTED)，結束時 update
 * 到 OK / OK_EMPTY / PARTIAL / FAILED。供 dashboard 反推「cron 今天有沒有跑」，
 * 不再依賴 Vercel runtime log（Hobby plan 1 小時就過期）或 MessageLog 推論。
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

  // 寫入 STARTED 紀錄 — 進場第一件事。寫入失敗只 console.error，不阻斷後續任務
  // （DB 連不上時 reminders 本來就會 fail；CronRunLog 寫不下不該讓事情更糟）。
  const runId = await safeCreateCronRunStart();

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

  // 終態判定（dashboard 用）：
  //   - reminders 子任務 throw          → FAILED
  //   - reminders OK 但其他子任務 throw → PARTIAL
  //   - 全部 OK 但 bookingsScanned = 0   → OK_EMPTY
  //   - 全部 OK 且有送                   → OK
  const reminderResult = results.reminders as
    | { total?: number; sent?: number; skipped?: number; failed?: number; error?: string }
    | undefined;
  const reminderFailed = reminderResult?.error != null;
  const otherFailed = failedTasks.some((k) => k !== "reminders");

  let terminalStatus: CronRunStatus;
  if (reminderFailed) {
    terminalStatus = CronRunStatus.FAILED;
  } else if (otherFailed) {
    terminalStatus = CronRunStatus.PARTIAL;
  } else if ((reminderResult?.total ?? 0) === 0) {
    terminalStatus = CronRunStatus.OK_EMPTY;
  } else {
    terminalStatus = CronRunStatus.OK;
  }

  await safeFinalizeCronRun(runId, {
    status: terminalStatus,
    bookingsScanned: reminderResult?.total ?? null,
    sent: reminderResult?.sent ?? null,
    skipped: reminderResult?.skipped ?? null,
    failed: reminderResult?.failed ?? null,
    summary: results as Record<string, unknown>,
    errorMessage: reminderFailed ? String(reminderResult?.error) : null,
  });

  if (failedTasks.length > 0) {
    console.error(`[Cron] FAILED tasks: ${failedTasks.join(", ")}`);
    return NextResponse.json({ ok: false, failedTasks, ...results }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...results });
}

// CronRunLog 寫入 helpers — 失敗只記 console，絕不拋給 cron 主流程。
// 寫不下 log 比 reminder 不發更不嚴重，不該讓兩個錯誤疊在一起。

async function safeCreateCronRunStart(): Promise<string | null> {
  try {
    const row = await prisma.cronRunLog.create({
      data: { jobName: CRON_JOB_NAME, status: CronRunStatus.STARTED },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    console.error("[Cron] CronRunLog create(STARTED) failed:", err);
    return null;
  }
}

async function safeFinalizeCronRun(
  runId: string | null,
  data: {
    status: CronRunStatus;
    bookingsScanned: number | null;
    sent: number | null;
    skipped: number | null;
    failed: number | null;
    summary: Record<string, unknown>;
    errorMessage: string | null;
  },
): Promise<void> {
  if (!runId) return; // STARTED 寫入失敗，無 row 可 update
  try {
    await prisma.cronRunLog.update({
      where: { id: runId },
      data: {
        finishedAt: new Date(),
        status: data.status,
        bookingsScanned: data.bookingsScanned,
        sent: data.sent,
        skipped: data.skipped,
        failed: data.failed,
        summary: data.summary as never,
        errorMessage: data.errorMessage,
      },
    });
  } catch (err) {
    console.error(`[Cron] CronRunLog finalize(${runId}) failed:`, err);
  }
}

function getPreviousMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  return `${prevY}-${String(prevM).padStart(2, "0")}`;
}
