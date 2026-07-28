import { NextRequest, NextResponse } from "next/server";
import { runIncompleteServiceReminders } from "@/server/services/incomplete-service-reminders";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[IncompleteServiceReminderCron] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runIncompleteServiceReminders();
    return NextResponse.json(
      { ok: result.failed === 0, ...result },
      { status: result.failed === 0 ? 200 : 500 },
    );
  } catch (error) {
    console.error("[IncompleteServiceReminderCron] failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
