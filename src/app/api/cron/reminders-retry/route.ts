import { NextRequest, NextResponse } from "next/server";
import { runReminders } from "@/server/reminder-engine";
import { prisma } from "@/lib/db";
import { CronRunStatus } from "@prisma/client";
import {
  decideReminderRetry,
  computeRetryStatus,
  type RetryReason,
} from "@/server/reminder-cron-retry";

export const dynamic = "force-dynamic";

const CRON_JOB_NAME = "reminders";

/**
 * Backup Cron Job — PR-R2-A（UTC 10:30 = 台灣 18:30）
 *
 * 主 cron (/api/cron/reminders, UTC 10:00 = TW 18:00) 有時因 Vercel deploy
 * window / platform delay 沒 fire（2026-06-05 事故：PR #263 merge 18:02 TW
 * 命中 deploy window，整個 18:00 tick 被 skip）。本 route 30 分鐘後再跑一次，
 * 由 decideReminderRetry() 判定該不該重跑（gate 邏輯在 helper 內，與 vitest
 * 共用）。
 *
 * Gate 結果：
 *   - retry → 寫 CronRunLog STARTED → runReminders() → finalize OK/OK_EMPTY/FAILED
 *   - noop  → 直接回 200 + {skipped:"already-completed"}，**不寫 CronRunLog**
 *             （避免 noop row 把 dashboard 最新狀態蓋掉）
 *
 * 雙發保險：runReminders() 用 triggerAt = today 18:00 TW，與主 cron 同一個；
 * engine 對 (ruleId, bookingId, triggerAt) 做 findFirst skip 已 SENT；DB unique
 * uniq_rule_booking_trigger (PR #116) 兜底。詳見 reminder-cron-retry.ts 註解。
 *
 * Status 寫入規格（jobName='reminders'，讓 PR #190 banner 自然讀到 retry 結果）：
 *   summary.retryOf      → 觸發 retry 的主 cron row id（NO_PRIOR_RUN 時為 null）
 *   summary.retryReason  → "NO_PRIOR_RUN" / "PRIOR_FAILED" / "PRIOR_STUCK"
 *   summary.scannedAt    → retry 真實啟動 ISO 時刻
 *
 * 認證：要求 `Authorization: Bearer ${CRON_SECRET}`，與主 cron 共用同一把 secret。
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[CronRetry] CRON_SECRET not configured");
    return NextResponse.json(
      { error: "Cron secret not configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decision = await decideReminderRetry();

  if (decision.action === "noop") {
    console.log(
      `[CronRetry] noop — reason: ${decision.reason}, latestRunId: ${decision.latestRunId ?? "none"}`,
    );
    return NextResponse.json({
      ok: true,
      skipped: "already-completed",
      reason: decision.reason,
      latestRunId: decision.latestRunId,
    });
  }

  // retry path — 寫 STARTED row 帶 summary marker
  const scannedAt = new Date().toISOString();
  const runId = await safeCreateRetryStart(decision.reason, decision.retryOf, scannedAt);

  let reminderResult: Awaited<ReturnType<typeof runReminders>> | null = null;
  let errorMessage: string | null = null;

  try {
    console.log(
      `[CronRetry] Running retry — reason: ${decision.reason}, retryOf: ${decision.retryOf ?? "none"}`,
    );
    reminderResult = await runReminders();
    console.log(
      `[CronRetry] Done: ${reminderResult.sent} sent, ${reminderResult.skipped} skipped, ${reminderResult.failed} failed`,
    );
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[CronRetry] Retry failed:", err);
  }

  // Finalize — 無論成功失敗都更新該 row 的 status + summary
  const terminalStatus = computeRetryStatus(reminderResult, errorMessage);
  const summary: Record<string, unknown> = {
    retryOf: decision.retryOf,
    retryReason: decision.reason,
    scannedAt,
  };
  if (reminderResult) summary.reminders = reminderResult;
  if (errorMessage) summary.error = errorMessage;

  await safeFinalizeRetry(runId, {
    status: terminalStatus,
    bookingsScanned: reminderResult?.total ?? null,
    sent: reminderResult?.sent ?? null,
    skipped: reminderResult?.skipped ?? null,
    failed: reminderResult?.failed ?? null,
    summary,
    errorMessage,
  });

  // 同主 cron 的 hardening 哲學：engine throw → 500，讓 Vercel cron history 紅燈
  if (errorMessage) {
    return NextResponse.json(
      { ok: false, retried: true, error: errorMessage, retryReason: decision.reason },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    retried: true,
    reason: decision.reason,
    retryOf: decision.retryOf,
    result: reminderResult,
  });
}

// CronRunLog 寫入 helpers — 失敗只記 console，絕不拋給 retry 主流程。
// 跟主 cron 同款處理（route.ts:179-225）。

async function safeCreateRetryStart(
  reason: RetryReason,
  retryOf: string | null,
  scannedAt: string,
): Promise<string | null> {
  try {
    const row = await prisma.cronRunLog.create({
      data: {
        jobName: CRON_JOB_NAME,
        status: CronRunStatus.STARTED,
        summary: { retryOf, retryReason: reason, scannedAt } as never,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    console.error("[CronRetry] CronRunLog create(STARTED) failed:", err);
    return null;
  }
}

async function safeFinalizeRetry(
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
  if (!runId) return;
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
    console.error(`[CronRetry] CronRunLog finalize(${runId}) failed:`, err);
  }
}
