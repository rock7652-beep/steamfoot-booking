import { fetchDaySlots } from "@/server/actions/slots";
import { requirePermission } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { OperationTiming } from "@/lib/operation-timing";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? "";
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return Response.json({ error: "日期無效" }, { status: 400, headers });
  }
  const timing = new OperationTiming("steamfoot.slots");
  try {
    await timing.measure("permission", () => requirePermission("booking.read"));
    // Keep the existing session/cookie store resolution and slot rules intact.
    const result = await timing.measure("slots", () => fetchDaySlots(date));
    return Response.json(result, { headers });
  } catch (error) {
    const status = error instanceof AppError && error.code === "UNAUTHORIZED" ? 401
      : error instanceof AppError && error.code === "FORBIDDEN" ? 403 : 503;
    return Response.json({ error: "時段暫時無法載入" }, { status, headers });
  } finally { timing.finish(); }
}
