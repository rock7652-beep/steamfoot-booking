import { NextRequest, NextResponse } from "next/server";
import { checkReminderCronHealth } from "@/server/reminder-cron-health";

export const dynamic = "force-dynamic";

/**
 * External healthcheck endpoint — PR-R2-B
 *
 * 給 cron-job.org 之類外部排程服務在 TW 19:00 主動探測。判斷今日 reminders
 * 批次（主 18:00 cron + 18:30 backup cron）是否至少有一次健康完成。
 *
 * 為什麼要這支：
 *   R2-A 在 Vercel 內部加了 18:30 backup cron，但若 Vercel 平台當天整個 cron
 *   系統都沒跑（兩支 cron 都被 skip），內部偵測不到。本 endpoint 由完全獨立的
 *   外部 infrastructure 探測 → 就算 Vercel cron 全死，外部也能發現並通知。
 *
 * 安全：
 *   - Bearer auth：`Authorization: Bearer ${CRON_HEALTHCHECK_SECRET}`
 *   - 與主 CRON_SECRET 分離（讓 healthcheck secret 可獨立 rotation）
 *   - 缺 secret env → 500；缺 / 錯 Authorization header → 401
 *   - 純 read-only，不寫 DB
 *   - 不輸出顧客姓名 / 電話 / lineUserId / bookingId — CronRunLog 本身只存
 *     計數字段（bookingsScanned / sent / skipped / failed），無個資
 *
 * HTTP 對應：
 *   healthy (OK / OK_EMPTY / PARTIAL / RUNNING)     → 200
 *   unhealthy (NO_RUN_TODAY / FAILED / STARTED_STUCK) → 503
 *
 * JSON 範例：
 *   healthy:
 *     { "ok": true, "healthy": true, "dateTW": "2026-06-06", "status": "OK",
 *       "startedAt": "...", "finishedAt": "...",
 *       "bookingsScanned": 6, "sent": 6, "skipped": 0, "failed": 0 }
 *   running:
 *     { "ok": true, "healthy": true, "dateTW": "...", "status": "STARTED",
 *       "reason": "RUNNING", "startedAt": "...", ... }
 *   unhealthy / no run:
 *     { "ok": false, "healthy": false, "dateTW": "...", "reason": "NO_RUN_TODAY" }
 *   unhealthy / with run:
 *     { "ok": false, "healthy": false, "dateTW": "...", "reason": "FAILED",
 *       "status": "FAILED", "startedAt": "...", ... }
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_HEALTHCHECK_SECRET;
  if (!secret) {
    console.error("[Healthcheck] CRON_HEALTHCHECK_SECRET not configured");
    return NextResponse.json(
      { error: "Healthcheck secret not configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { verdict, dateTW } = await checkReminderCronHealth();

  switch (verdict.kind) {
    case "healthy":
      return NextResponse.json(
        {
          ok: true,
          healthy: true,
          dateTW,
          status: verdict.run.status,
          startedAt: verdict.run.startedAt,
          finishedAt: verdict.run.finishedAt,
          bookingsScanned: verdict.run.bookingsScanned,
          sent: verdict.run.sent,
          skipped: verdict.run.skipped,
          failed: verdict.run.failed,
        },
        { status: 200 },
      );
    case "running":
      return NextResponse.json(
        {
          ok: true,
          healthy: true,
          dateTW,
          status: verdict.run.status,
          reason: "RUNNING",
          startedAt: verdict.run.startedAt,
          finishedAt: verdict.run.finishedAt,
          bookingsScanned: verdict.run.bookingsScanned,
          sent: verdict.run.sent,
          skipped: verdict.run.skipped,
          failed: verdict.run.failed,
        },
        { status: 200 },
      );
    case "unhealthy_no_run":
      return NextResponse.json(
        {
          ok: false,
          healthy: false,
          dateTW,
          reason: verdict.reason,
        },
        { status: 503 },
      );
    case "unhealthy_with_run":
      return NextResponse.json(
        {
          ok: false,
          healthy: false,
          dateTW,
          reason: verdict.reason,
          status: verdict.run.status,
          startedAt: verdict.run.startedAt,
          finishedAt: verdict.run.finishedAt,
          bookingsScanned: verdict.run.bookingsScanned,
          sent: verdict.run.sent,
          skipped: verdict.run.skipped,
          failed: verdict.run.failed,
        },
        { status: 503 },
      );
    default: {
      // 窮舉性檢查 — 新增 verdict kind 時 TS error 提醒補處理
      const _exhaustive: never = verdict;
      throw new Error(`Unhandled verdict kind: ${String(_exhaustive)}`);
    }
  }
}
