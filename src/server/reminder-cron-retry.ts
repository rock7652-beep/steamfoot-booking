/**
 * Backup reminder cron 的 retry 決策 helper — PR-R2-A
 *
 * 主 cron (TW 18:00) 有時因 Vercel deploy window / platform delay 沒 fire
 * （2026-06-05 事故）。/api/cron/reminders-retry 在 TW 18:30 再跑一次，本
 * helper 提供「該不該重跑」的純函式判定，被 route 與 vitest 共用，避免
 * 判斷邏輯 drift。
 *
 * 決策表（依今日最新一筆 jobName='reminders' CronRunLog）：
 *
 *   無紀錄           → retry  (NO_PRIOR_RUN)    — 6/5 事故的情境
 *   OK               → noop   (ALREADY_OK)
 *   OK_EMPTY         → noop   (ALREADY_OK_EMPTY) — 主 cron 跑了但今日無 eligible
 *   PARTIAL          → noop   (ALREADY_PARTIAL)  — engine OK，只是其他子任務 throw
 *   FAILED           → retry  (PRIOR_FAILED)     — reminders 子任務整個 throw
 *   STARTED 且 > 5min → retry  (PRIOR_STUCK)     — 主 cron 卡死沒寫 finishedAt
 *   STARTED 且 ≤ 5min → noop   (STILL_RUNNING)    — 讓主 cron 跑完
 *
 * 雙發保險（不在本 helper，但要在這留 paper trail）：
 *   即使誤觸發 retry，runReminders() 用 triggerAt = todayReminderTriggerAt()
 *   = 今天 18:00 TW（與主 cron 同一個），engine 對 (ruleId, bookingId,
 *   triggerAt) 做 findFirst 會 skip 已存在的 SENT/PENDING row；DB 上的 unique
 *   uniq_rule_booking_trigger (PR #116 migration) 是 race 兜底。engine 層的
 *   行為由 src/__tests__/reminder-engine.test.ts (idempotent) 覆蓋。
 */

import type { CronRunStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";

/** STARTED 視為「卡住」的門檻（毫秒）— 超過此值 retry 接手，避免主 cron 還在跑時誤搶 */
export const STUCK_THRESHOLD_MS = 5 * 60 * 1000;

const REMINDER_JOB_NAME = "reminders";

export type RetryReason = "NO_PRIOR_RUN" | "PRIOR_FAILED" | "PRIOR_STUCK";
export type NoopReason =
  | "ALREADY_OK"
  | "ALREADY_OK_EMPTY"
  | "ALREADY_PARTIAL"
  | "STILL_RUNNING";

export type RetryDecision =
  | { action: "retry"; reason: RetryReason; retryOf: string | null }
  | { action: "noop"; reason: NoopReason; latestRunId: string | null };

/**
 * 給定當前時刻，回傳 retry / noop 決策。純讀 DB，無 side effect。
 * `now` 預設 new Date()，測試可以 inject 假時間。
 */
export async function decideReminderRetry(
  now: Date = new Date(),
): Promise<RetryDecision> {
  const todayStr = toLocalDateStr(now);
  const { start: todayStart, end: todayEnd } = dayRange(todayStr);

  const latest = await prisma.cronRunLog.findFirst({
    where: {
      jobName: REMINDER_JOB_NAME,
      startedAt: { gte: todayStart, lte: todayEnd },
    },
    orderBy: { startedAt: "desc" },
    select: { id: true, status: true, startedAt: true },
  });

  if (!latest) {
    return { action: "retry", reason: "NO_PRIOR_RUN", retryOf: null };
  }

  switch (latest.status) {
    case "OK":
      return { action: "noop", reason: "ALREADY_OK", latestRunId: latest.id };
    case "OK_EMPTY":
      return { action: "noop", reason: "ALREADY_OK_EMPTY", latestRunId: latest.id };
    case "PARTIAL":
      return { action: "noop", reason: "ALREADY_PARTIAL", latestRunId: latest.id };
    case "FAILED":
      return { action: "retry", reason: "PRIOR_FAILED", retryOf: latest.id };
    case "STARTED": {
      const ageMs = now.getTime() - latest.startedAt.getTime();
      if (ageMs > STUCK_THRESHOLD_MS) {
        return { action: "retry", reason: "PRIOR_STUCK", retryOf: latest.id };
      }
      return { action: "noop", reason: "STILL_RUNNING", latestRunId: latest.id };
    }
    default: {
      // 窮舉性檢查 — Prisma 若新增 CronRunStatus enum 值，這裡 TS error 提醒補處理
      const _exhaustive: never = latest.status;
      throw new Error(`Unhandled CronRunStatus: ${String(_exhaustive)}`);
    }
  }
}

/** 給 route 寫 summary marker 用 — 不導出進 production 路徑，只方便閱讀 */
export type RetrySummaryMarker = {
  retryOf: string | null;
  retryReason: RetryReason;
  scannedAt: string;
};

// Type-only re-export for tests that need CronRunStatus typing.
export type { CronRunStatus };

// ============================================================
// Terminal status computation — invariant 抽出
// ============================================================

/**
 * Engine 跑完後決定 CronRunLog 最終 status 該寫什麼。
 *
 * 規則（順序敏感）：
 *   1. engine throw → FAILED（route 把 catch 到的 error message 帶進來）
 *   2. result === null → OK_EMPTY（防御性：retry path 理論上一定 await runReminders，
 *      但若某天有 bug 讓 result 缺失，給 EMPTY 比 OK 安全）
 *   3. total === 0 → OK_EMPTY（engine 真的沒掃到任何 eligible booking）
 *   4. failed > 0 → PARTIAL（批次完成但有個別傳送失敗，不盲目重跑整批）
 *   5. 其他（包含 total > 0 + sent=0 + skipped=N + failed=0） → OK
 *
 * 關鍵 invariant：**OK_EMPTY 只用在 total === 0**。
 *
 * 反例（不該標成 OK_EMPTY）：
 *   total=6 sent=0 skipped=6 failed=0 — 代表「主 cron 已發完 6 筆，retry 全
 *   dedupe skip」。total > 0 → 必須回 OK，audit 才看得出「retry 有掃到 6 筆
 *   booking 但無新發送」，不會被誤判成「今天無 eligible booking」。
 *
 * 個別 LINE 發送失敗（result.failed > 0）不視為批次 FAILED。FAILED 保留給
 * engine throw / DB / cron 中斷；個別失敗以 PARTIAL 呈現並由後台引導重綁。
 */
export function computeRetryStatus(
  result: { total: number; sent: number; failed: number } | null,
  errorMessage: string | null,
): CronRunStatus {
  if (errorMessage) return "FAILED";
  if (!result || result.total === 0) return "OK_EMPTY";
  if (result.failed > 0) return "PARTIAL";
  return "OK";
}
