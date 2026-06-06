/**
 * 外部 healthcheck 判定 helper — PR-R2-B
 *
 * 補 R2-A 盲點：R2-A 在 Vercel 內部加了 18:30 backup cron，但若 Vercel 平台當天
 * cron 系統整體沒跑（兩支 cron 都 missed），內部一樣偵測不到。R2-B 讓外部排程
 * 服務（cron-job.org 之類）每天 TW 19:00 主動探測這個 endpoint，靠完全獨立的
 * infrastructure 確認當天提醒批次有沒有 OK。
 *
 * 判定規則（依今日最新一筆 jobName='reminders' CronRunLog）：
 *
 *   無紀錄                   → unhealthy / NO_RUN_TODAY
 *   OK / OK_EMPTY / PARTIAL  → healthy（PARTIAL 代表 reminders 子任務 OK，
 *                                       只是其他子任務 throw，提醒系統本身健康）
 *   FAILED                   → unhealthy / FAILED
 *   STARTED 且 > 5min        → unhealthy / STARTED_STUCK
 *   STARTED 且 ≤ 5min        → healthy / RUNNING（剛好執行中，避免誤報）
 *
 * 安全：本 helper 只 read-only 查 CronRunLog，無 side effect、不碰個資。route
 * 端做 bearer auth + 不洩漏顧客資訊（CronRunLog 本身就只有計數，無姓名 / 電話 /
 * lineUserId / bookingId）。
 */

import type { CronRunStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";

/** STARTED 視為「卡住」的門檻（毫秒）— 與 R2-A retry 對齊 */
export const HEALTH_STUCK_THRESHOLD_MS = 5 * 60 * 1000;

const REMINDER_JOB_NAME = "reminders";

export type UnhealthyReason = "NO_RUN_TODAY" | "FAILED" | "STARTED_STUCK";

/** 從 CronRunLog row 萃出非敏感的計數字段，給 healthcheck 回傳用 */
export interface HealthRunSummary {
  startedAt: string;
  finishedAt: string | null;
  status: CronRunStatus;
  bookingsScanned: number | null;
  sent: number | null;
  skipped: number | null;
  failed: number | null;
}

/** verdict discriminated union — route 依 kind 決定 HTTP status + JSON shape */
export type HealthVerdict =
  | { kind: "healthy"; run: HealthRunSummary } // OK / OK_EMPTY / PARTIAL
  | { kind: "running"; run: HealthRunSummary } // STARTED ≤ 5 min — 仍視為 healthy 但標 RUNNING
  | { kind: "unhealthy_no_run"; reason: "NO_RUN_TODAY" } // 無 row
  | { kind: "unhealthy_with_run"; reason: "FAILED" | "STARTED_STUCK"; run: HealthRunSummary };

/**
 * 純讀 DB，根據今日 reminders CronRunLog 最新 row 判定健康狀態。
 * `now` 預設 new Date()，測試可 inject 假時間。
 */
export async function checkReminderCronHealth(
  now: Date = new Date(),
): Promise<{ verdict: HealthVerdict; dateTW: string }> {
  const dateTW = toLocalDateStr(now);
  const { start, end } = dayRange(dateTW);

  const latest = await prisma.cronRunLog.findFirst({
    where: {
      jobName: REMINDER_JOB_NAME,
      startedAt: { gte: start, lte: end },
    },
    orderBy: { startedAt: "desc" },
    select: {
      startedAt: true,
      finishedAt: true,
      status: true,
      bookingsScanned: true,
      sent: true,
      skipped: true,
      failed: true,
    },
  });

  if (!latest) {
    return {
      verdict: { kind: "unhealthy_no_run", reason: "NO_RUN_TODAY" },
      dateTW,
    };
  }

  const run: HealthRunSummary = {
    startedAt: latest.startedAt.toISOString(),
    finishedAt: latest.finishedAt?.toISOString() ?? null,
    status: latest.status,
    bookingsScanned: latest.bookingsScanned,
    sent: latest.sent,
    skipped: latest.skipped,
    failed: latest.failed,
  };

  switch (latest.status) {
    case "OK":
    case "OK_EMPTY":
    case "PARTIAL":
      return { verdict: { kind: "healthy", run }, dateTW };
    case "FAILED":
      return {
        verdict: { kind: "unhealthy_with_run", reason: "FAILED", run },
        dateTW,
      };
    case "STARTED": {
      const ageMs = now.getTime() - latest.startedAt.getTime();
      if (ageMs > HEALTH_STUCK_THRESHOLD_MS) {
        return {
          verdict: { kind: "unhealthy_with_run", reason: "STARTED_STUCK", run },
          dateTW,
        };
      }
      return { verdict: { kind: "running", run }, dateTW };
    }
    default: {
      // 窮舉性檢查 — Prisma 若新增 CronRunStatus，這裡 TS error 提醒補處理
      const _exhaustive: never = latest.status;
      throw new Error(`Unhandled CronRunStatus: ${String(_exhaustive)}`);
    }
  }
}
