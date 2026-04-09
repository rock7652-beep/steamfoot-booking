import { NextRequest, NextResponse } from "next/server";
import { runReminders } from "@/server/reminder-engine";

export const dynamic = "force-dynamic";

/**
 * 提醒 Cron Job — 每 5 分鐘執行一次
 *
 * Vercel Cron 設定：vercel.json → crons → "* /5 * * * *"
 * 或由外部 cron service 呼叫
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cron] Running reminders...");
    const result = await runReminders();
    console.log(`[Cron] Done: ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed`);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("[Cron] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
