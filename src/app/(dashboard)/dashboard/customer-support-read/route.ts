import { getCustomerPanelAdvanced } from "@/server/actions/customer-panel-advanced";
import { loadMemberConnectionAction } from "@/server/actions/store-member-connection";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

// Reuse the existing readers so every request still checks the current actor,
// permission and store visibility. This endpoint never performs a mutation.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const customerId = params.get("customerId");
  const kind = params.get("kind");
  if (!customerId || customerId.length > 200 || (kind !== "connection" && kind !== "advanced")) {
    return Response.json({ success: false, error: "參數無效" }, { status: 400, headers });
  }
  const result = kind === "connection"
    ? await loadMemberConnectionAction(customerId)
    : await getCustomerPanelAdvanced(customerId);
  return Response.json(result, { headers });
}
