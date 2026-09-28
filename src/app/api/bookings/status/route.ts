import { z } from "zod";
import { markCompleted, revertBookingStatus } from "@/server/actions/booking";
import { completeBookingSchema } from "@/lib/validators/booking";
import { withBookingRouteMutation } from "@/lib/booking-route-mutation";

const headers = { "Cache-Control": "private, no-store" };
const schema = z.object({
  bookingId: z.string().min(1).max(128),
  operation: z.enum(["complete", "revert"]),
  input: completeBookingSchema.optional(),
});
export async function POST(request: Request) {
  // Match Server Actions' same-origin write boundary. Never trust a supplied
  // role/store; existing actions enforce session, subscription and write scope.
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ success: false, error: "不允許此操作來源" }, { status: 403, headers });
  }
  let input: z.infer<typeof schema>;
  try { input = schema.parse(await request.json()); }
  catch { return Response.json({ success: false, error: "操作資料無效" }, { status: 400, headers }); }
  try {
    const result = await withBookingRouteMutation(() => input.operation === "complete"
      ? markCompleted(input.bookingId, input.input)
      : revertBookingStatus(input.bookingId));
    return Response.json(result, { headers });
  } catch {
    // A transport failure is uncertain: the client reconciles and never retries
    // a write automatically (it may already have committed).
    return Response.json({ error: "暫時無法確認操作結果" }, { status: 503, headers });
  }
}
