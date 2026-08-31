import { NextRequest, NextResponse } from "next/server";
import { sendSpaDemoNextDayReminder } from "@/server/services/spa-demo-next-day-reminder";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await sendSpaDemoNextDayReminder();
  return NextResponse.json(result);
}
