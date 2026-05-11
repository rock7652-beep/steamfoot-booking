import { NextRequest, NextResponse } from "next/server";
import { runReminders } from "@/server/reminder-engine";

export const dynamic = "force-dynamic";

/**
 * 提醒 Tick Cron（每 30 分鐘執行一次）
 *
 * 只處理提醒引擎；每日批次任務（報表 / 降級 / 試用 / 清理）走 /api/cron/reminders。
 *
 * 認證：要求 `Authorization: Bearer ${CRON_SECRET}`。
 *   - CRON_SECRET 未設定 → 視為 misconfig，一律拒絕（避免外部任意觸發）
 *   - Vercel Cron 自動帶 `Authorization: Bearer ${CRON_SECRET}`
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[Cron tick] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cron tick] Running reminders...");
    const result = await runReminders();
    console.log(
      `[Cron tick] Done: ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed`,
    );
    return NextResponse.json({ ok: true, reminders: result });
  } catch (error) {
    console.error("[Cron tick] Reminder error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
