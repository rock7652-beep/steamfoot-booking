import { NextRequest, NextResponse } from "next/server";
import { InvalidEcpayNotificationError, processEcpayRecurringNotification } from "@/server/services/ecpay-recurring-notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 64_000) return new NextResponse("invalid payload", { status: 413 });
  try {
    const form = await request.formData();
    const fields = Object.fromEntries(Array.from(form.entries()).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    await processEcpayRecurringNotification(fields);
    return new NextResponse("1|OK", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[Ecpay recurring return] notification rejected", error instanceof Error ? error.message : String(error));
    const status = error instanceof InvalidEcpayNotificationError ? 400 : 500;
    return new NextResponse(status === 400 ? "notification rejected" : "temporary error", { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
}
