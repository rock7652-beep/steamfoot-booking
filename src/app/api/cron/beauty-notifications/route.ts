import { runBeautyManagerReminders } from "@/server/beauty/manager-notifications";
import { NextRequest, NextResponse } from "next/server";
import {runBeautyCareReminders} from "@/server/beauty/care-reminders";
import { runBeautyNotifications } from "@/server/beauty/notifications";
import {runBeautyDigitalManagerReminders} from '@/server/beauty/digital-manager-reminders';
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const services=await runBeautyNotifications(),care=await runBeautyCareReminders(),managers=await runBeautyManagerReminders(),digitalManager=await runBeautyDigitalManagerReminders();
  return NextResponse.json({sent:services.sent+care.sent+managers.sent,skipped:services.skipped+care.skipped+managers.skipped,failed:services.failed+care.failed+managers.failed+digitalManager.failed,care,managers,digitalManager});
}
