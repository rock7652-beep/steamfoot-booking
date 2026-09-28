import { collectTrialPayment } from "@/server/actions/trial-booking";
import { collectTrialPaymentSchema } from "@/lib/validators/trial-booking";
import { withBookingRouteMutation } from "@/lib/booking-route-mutation";
import { OperationTiming } from "@/lib/operation-timing";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ success: false, error: "不允許此操作來源" }, { status: 403, headers });
  }
  let input;
  try { input = collectTrialPaymentSchema.parse(await request.json()); }
  catch { return Response.json({ success: false, error: "收款資料無效" }, { status: 400, headers }); }
  const timing = new OperationTiming("steamfoot.trialPayment");
  try {
    // Original action owns permission, store scope, transaction and duplicate guards.
    const result = await withBookingRouteMutation(() => collectTrialPayment(input));
    return Response.json(result, { headers });
  } catch {
    return Response.json({ error: "暫時無法確認收款結果" }, { status: 503, headers });
  } finally { timing.finish(); }
}
