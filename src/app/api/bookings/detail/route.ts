import { AppError } from "@/lib/errors";
import { OperationTiming } from "@/lib/operation-timing";
import { musicReadTimingScope, withMusicReadTiming } from "@/lib/music-read-timing";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const timing = new OperationTiming("booking.detail.http");
  const reads: Record<string, number> = {};
  // Re-enter the owned diagnostic scope after async module loading. No auth reuse.
  const scopedRead = <T>(phase: "entry" | "detail", work: () => Promise<T>) =>
    withMusicReadTiming(reads, () => musicReadTimingScope(phase, work));
  const respond = (response: Response) => {
    response.headers.set("Server-Timing", timing.serverTiming());
    response.headers.set("X-Booking-Read-Timing", JSON.stringify(reads));
    return response;
  };
  try {
    const { requirePermission } = await timing.measure("loadPermission", () => import("@/lib/permissions"));
    await timing.measure("entryPermission", () => scopedRead("entry", () => requirePermission("booking.read", timing)));
    const params = new URL(request.url).searchParams;
    const id = params.get("bookingId");
    const storeId = params.get("storeId");
    if (!id || !storeId) return respond(Response.json({}, { status: 400, headers }));
    // Existing service still validates store access and scopes the booking query.
    const { fetchBookingDetail } = await timing.measure("loadDetail", () => import("@/server/actions/booking-drawer"));
    const payload = await timing.measure("detail", () => scopedRead("detail", () => fetchBookingDetail(id, storeId)));
    return respond(await timing.measure("serialize", async () => Response.json(payload, { headers })));
  } catch (error) {
    const status = error instanceof AppError && error.code === "UNAUTHORIZED" ? 401
      : error instanceof AppError && error.code === "FORBIDDEN" ? 403 : 503;
    return respond(Response.json({ error: "預約明細暫時無法載入" }, { status, headers }));
  } finally {
    timing.finish();
  }
}
