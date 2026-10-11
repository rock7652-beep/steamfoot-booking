import { switchActiveStore } from "@/server/actions/store-switch";

/** Viewing context only; existing ADMIN/store authorization and audit apply. */
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ success: false, error: "請從目前網站切換店舖" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body.storeId !== "string" || !body.storeId.trim() || body.storeId.length > 100) {
    return Response.json({ success: false, error: "請選擇店舖" }, { status: 400 });
  }
  const result = await switchActiveStore(body.storeId);
  return Response.json(result, { status: result.success ? 200 : 403 });
}
