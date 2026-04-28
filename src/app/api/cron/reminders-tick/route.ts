import { NextRequest, NextResponse } from "next/server";
import { runReminders } from "@/server/reminder-engine";

export const dynamic = "force-dynamic";

/**
 * 提醒 Tick Cron（每 30 分鐘執行一次）
 *
 * 只處理提醒引擎，不處理每日任務（每日任務在 /api/cron/reminders）
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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
