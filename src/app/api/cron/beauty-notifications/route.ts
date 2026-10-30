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
  let crashed=false;
  async function isolated<T>(name:string,run:()=>Promise<T>,fallback:T):Promise<T>{
    try{return await run();}
    catch{crashed=true;console.error('[Beauty notification cron] worker failed',{worker:name});return fallback;}
  }
  // Store notifications must run even when a LINE worker fails, and vice versa.
  const digitalManager=await isolated('digital-manager',runBeautyDigitalManagerReminders,{recorded:0,failed:1});
  const services=await isolated('services',runBeautyNotifications,{sent:0,skipped:0,failed:1});
  const care=await isolated('care',runBeautyCareReminders,{sent:0,skipped:0,failed:1});
  const managers=await isolated('managers',runBeautyManagerReminders,{sent:0,skipped:0,failed:1});
  return NextResponse.json({sent:services.sent+care.sent+managers.sent,skipped:services.skipped+care.skipped+managers.skipped,failed:services.failed+care.failed+managers.failed+digitalManager.failed,care,managers,digitalManager},{status:crashed?500:200});
}
