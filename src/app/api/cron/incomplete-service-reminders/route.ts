import {digitalManagerCronPreviewScope} from "../../../../../scripts/digital-manager-cron-preview-scope.mjs";
import { NextRequest, NextResponse } from "next/server";
import {reconcileStoreReceivableNotices} from '@/server/services/store-receivable-notices';
import { runIncompleteServiceReminders } from "@/server/services/incomplete-service-reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[IncompleteServiceReminderCron] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try { digitalManagerCronPreviewScope(); } catch { return NextResponse.json({error:"Unauthorized"},{status:401}); }
  try {
    const acceptance=digitalManagerCronPreviewScope();
    const receivables=await reconcileStoreReceivableNotices(acceptance?.now??new Date(),acceptance?.storeIds);
    const result = await runIncompleteServiceReminders();
    result.failed+=receivables.failed;
    return NextResponse.json(
      { ok: result.failed === 0, ...result, receivables },
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
