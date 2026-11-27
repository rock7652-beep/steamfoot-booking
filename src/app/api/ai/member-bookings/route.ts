import { aiMemberReadSchema, aiMemberDataSchema } from "@/server/ai/member-bookings-contract";
import { readAiMemberBookings } from "@/server/ai/member-bookings";
import { formatTWTime } from "@/lib/date-utils";
import { assertAiPreview } from "../../../../../scripts/ai-digital-butler-preview-scope.mjs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request) {
  try { assertAiPreview(); } catch { return Response.json({ success: false, error: "此查詢尚未開放。" }, { status: 404, headers }); }
  const values = Object.fromEntries(new URL(request.url).searchParams);
  const input = aiMemberReadSchema.safeParse({ ...values, page: values.page === undefined ? undefined : Number(values.page) });
  if (!input.success) return Response.json({ success: false, error: "查詢條件無效，請重新選擇日期。" }, { status: 400, headers });
  try {
    const data = aiMemberDataSchema.parse(await readAiMemberBookings(input.data));
    return Response.json({ success: true, snapshot: { ...data, viewKey: input.data.viewKey, checkedAtLabel: formatTWTime(new Date()) } }, { headers });
  } catch (error) {
    const denied = error instanceof Error && (/^AI_MEMBER_/.test(error.message) ||
      ("code" in error && ["FORBIDDEN", "UNAUTHORIZED"].includes(String(error.code))));
    return Response.json({ success: false, error: denied ? "無法確認本人會員或查詢權限，請重新登入後再試。" : "本人預約暫時無法讀取，請稍後重新查詢。" }, { status: denied ? 403 : 503, headers });
  }
}
