import { GET as readCashbook } from "@/app/api/cashbook/quick/route";
import { musicDataSeparationEnabled } from "@/server/services/music-data-scope";
export const dynamic = "force-dynamic";
/** Store-scoped rewrite preserves route identity; the existing reader still
 * authenticates and checks the requested store, feature and staff scope. */
export async function GET(request: Request) {
  if (!musicDataSeparationEnabled("store-lubymusic"))
    return Response.json({ error: "此入口僅供音樂教室測試站。" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  return readCashbook(request);
}
