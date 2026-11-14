import { getCustomerDrawerDetailAction } from "@/server/actions/customer";
import { OperationTiming } from "@/lib/operation-timing";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

/** Reuse the existing authorization and store boundary outside the action queue. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("customerId");
  if (!id || id.length > 100) return Response.json({ success: false, error: "參數無效" }, { status: 400, headers });
  const timing = new OperationTiming("customer-primary-read");
  try {
    const result = await timing.measure("primary", () => getCustomerDrawerDetailAction(id));
    return Response.json(result, { headers: { ...headers, "Server-Timing": timing.serverTiming() } });
  } finally {
    timing.finish();
  }
}
