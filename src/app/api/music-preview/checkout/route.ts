import { assignCoursePointCard } from "@/server/actions/course-members";
import { recordMusicTuitionReceipt } from "@/server/actions/music-tuition";
import { courseManager } from "@/server/services/course-access";
import { musicDataSeparationEnabled } from "@/server/services/music-data-scope";
import { handleActionError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const started=performance.now();
  const reply = (value: unknown, status = 200) => Response.json(value, {
    status, headers: { "Cache-Control": "no-store", "Server-Timing": `checkout;dur=${Math.round(performance.now()-started)}`, "X-Music-Build": process.env.VERCEL_GIT_COMMIT_SHA ?? "local" },
  });
  // A cookie-authenticated JSON endpoint must retain Server Actions' CSRF protection.
  if (request.headers.get("origin") !== new URL(request.url).origin ||
      !request.headers.get("content-type")?.startsWith("application/json"))
    return reply({ success: false, error: "請從本站的購課或付款表單送出。" }, 403);
  if (request.headers.get("x-music-contract") !== "1")
    return reply({ success: false, error: "請更新表單版本。" }, 409);
  // Preserve the visible store through the existing authenticated store rewrite.
  // The destination is fixed, never derived from client-provided store headers.
  if (new URL(request.url).pathname === "/api/music-preview/checkout")
    return Response.redirect(new URL("/s/lubymusic/admin/dashboard/music-checkout", request.url), 307);
  try {
    const { storeId } = await courseManager("transaction.create");
    if (!musicDataSeparationEnabled(storeId)) return reply({ success: false, error: "此入口僅供音樂教室測試站。" }, 403);
    const body = await request.text();
    if (body.length > 20000) return reply({ success: false, error: "表單內容過長。" }, 400);
    const { operation, input } = JSON.parse(body);
    // Existing actions re-check permissions, store, discounts, schema and transaction locks.
    if (operation === "purchase") return reply(await assignCoursePointCard(input));
    if (operation === "receipt") return reply(await recordMusicTuitionReceipt(input));
    return reply({ success: false, error: "不支援的收款操作。" }, 400);
  } catch (error) { return reply(handleActionError(error)); }
}
