import { getCustomerPanelSummary } from "@/server/actions/customer-panel-summary";
import { ServerTiming } from "@/lib/perf";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("customerId");
  if (!id || id.length > 100) return Response.json({ success: false, error: "參數無效" }, { status: 400, headers });
  const timer = new ServerTiming("customer-drawer-summary");
  try {
    // The existing action independently checks customer.read, active/viewed
    // store, merged/suspended customer and each summary permission.
    return Response.json(await getCustomerPanelSummary(id), { headers });
  } finally {
    timer.finish();
  }
}
