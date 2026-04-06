import { NextRequest, NextResponse } from "next/server";
import { runDailyReminders } from "@/server/reminder-engine";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cron] Running daily reminders...");
    const result = await runDailyReminders();
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
