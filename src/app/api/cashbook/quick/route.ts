import { fetchQuickCashbook } from "@/server/actions/quick-cashbook";
import { AppError } from "@/lib/errors";

const headers = { "Cache-Control": "private, no-store" };

/** Read-only transport: no Server Action page/RSC response. Authorization stays
 * in the existing reader, including active store, feature and staff scope. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const storeId = params.get("storeId");
  const page = Number(params.get("page") ?? "1");
  if (!storeId || !Number.isSafeInteger(page) || page < 1 || page > 100000) {
    return Response.json({ error: "讀取參數無效" }, { status: 400, headers });
  }
  try {
    const startedAt = performance.now();
    const data = await fetchQuickCashbook(storeId, page);
    return Response.json({ storeId, data }, { headers: {
      ...headers, "Server-Timing": `cashbook;dur=${Math.round(performance.now() - startedAt)}`,
    } });
  } catch (error) {
    const status = error instanceof AppError && error.code === "UNAUTHORIZED" ? 401
      : error instanceof AppError && error.code === "FORBIDDEN" ? 403 : 503;
    return Response.json({ error: "收支紀錄暫時無法讀取，請重試。" }, { status, headers });
  }
}
