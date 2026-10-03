import { requirePermission } from "@/lib/permissions";
import { fetchBookingDetail } from "@/server/actions/booking-drawer";
import { AppError } from "@/lib/errors";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    await requirePermission("booking.read");
    const params = new URL(request.url).searchParams;
    const id = params.get("bookingId");
    const storeId = params.get("storeId");
    if (!id || !storeId) return Response.json({}, { status: 400, headers });
    // Existing service validates store access and scopes the booking query.
    return Response.json(await fetchBookingDetail(id, storeId), { headers });
  } catch (error) {
    const status = error instanceof AppError && error.code === "UNAUTHORIZED" ? 401
      : error instanceof AppError && error.code === "FORBIDDEN" ? 403 : 503;
    return Response.json({ error: "預約明細暫時無法載入" }, { status, headers });
  }
}
