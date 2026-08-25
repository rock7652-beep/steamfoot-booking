import { NextRequest, NextResponse } from "next/server";
import { GET as runRetryRoute } from "../reminders-retry/route";

export const dynamic = "force-dynamic";

const ONE_TIME_KEY = "recovery-20260825-b0c972f14e8d4a21";
const EXPIRES_AT = Date.parse("2026-08-25T13:00:00.000Z");

/**
 * Narrow emergency recovery for the 2026-08-25 missed reminder batch.
 * It accepts no booking/store input, expires at 21:00 Taiwan time, and
 * delegates to the normal retry gate + idempotent reminder engine.
 * This route is removed immediately after successful recovery.
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== ONE_TIME_KEY) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (Date.now() >= EXPIRES_AT) {
    return NextResponse.json({ error: "Recovery window expired" }, { status: 410 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }

  const delegatedRequest = new NextRequest(request.url, {
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  return runRetryRoute(delegatedRequest);
}
