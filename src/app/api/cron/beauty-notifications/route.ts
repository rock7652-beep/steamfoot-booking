import { NextRequest, NextResponse } from "next/server";
import {runBeautyCareReminders} from "@/server/beauty/care-reminders";
import { runBeautyNotifications } from "@/server/beauty/notifications";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const services=await runBeautyNotifications(),care=await runBeautyCareReminders();
  return NextResponse.json({sent:services.sent+care.sent,skipped:services.skipped+care.skipped,failed:services.failed+care.failed,care});
}
