import { z } from "zod";
import { AppError } from "@/lib/errors";
import { encodeReminderPanel } from "@/lib/reminder-panel-wire";
import { readSteamReminderPanel, readCourseReminderPanel } from "@/server/queries/reminder-panel";

const input = z.object({
  module: z.enum(["steamfoot", "course"]),
  expectedStoreId: z.string().min(1).max(200),
  expectedActorId: z.string().min(1).max(200),
  query: z.string().max(2000),
}).strict();
const allowed = new Set(["tab", "section", "page", "status", "search", "type", "date", "audience"]);
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
/** Independent read: no dashboard layout, labels, scope options or RSC response. */
export async function GET(request: Request) {
  if (request.headers.get("x-reminder-panel") !== "1" || request.headers.get("sec-fetch-site") === "cross-site")
    return Response.json({ success: false, error: "請從本站重新開啟提醒管理。" }, { status: 403, headers });
  const parsed = input.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ success: false, error: "讀取參數有誤。" }, { status: 400, headers });
  const { module, expectedStoreId, expectedActorId, query } = parsed.data;
  const params = Object.fromEntries(new URLSearchParams(query));
  if (Object.keys(params).some(key => !allowed.has(key))) return Response.json({ success: false, error: "讀取參數有誤。" }, { status: 400, headers });
  const start = performance.now();
  try {
    const data = module === "course" ? await readCourseReminderPanel(params, expectedStoreId, expectedActorId) : await readSteamReminderPanel(params, expectedStoreId, expectedActorId);
    return Response.json({ success: true, storeId: data.storeId, module, query, data: encodeReminderPanel(data) }, { headers: { ...headers, "Server-Timing": `reminder;dur=${Math.round(performance.now() - start)}` } });
  } catch (error) {
    const denied = error instanceof AppError && ["FORBIDDEN", "NOT_FOUND", "UNAUTHORIZED"].includes(error.code);
    return Response.json({ success: false, error: denied ? "登入、店舖或權限已變更，請重新開啟提醒管理。" : "提醒資料讀取失敗，請重試。" }, { status: denied ? 403 : 503, headers });
  }
}
