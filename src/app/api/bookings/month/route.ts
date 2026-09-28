import { refreshBookingManagement } from "@/server/actions/booking-refresh";
import { AppError } from "@/lib/errors";

const headers = { "Cache-Control": "private, no-store" };

/** Read-only transport: avoids a Server Action's additional page render. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const storeId = params.get("storeId");
  if (!storeId?.trim()) {
    return Response.json({ error: "請指定門市" }, { status: 400, headers });
  }
  try {
    // This service requires booking.read, validates the explicit store against
    // the session, rejects SPA, and validates the year/month before reading.
    const snapshot = await refreshBookingManagement({
      year: Number(params.get("year")),
      month: Number(params.get("month")),
      storeId,
      date: null,
    });
    return Response.json(snapshot, { headers });
  } catch (error) {
    const status = error instanceof AppError
      ? ({ UNAUTHORIZED: 401, FORBIDDEN: 403, VALIDATION: 400, NOT_FOUND: 404 }[error.code as "UNAUTHORIZED" | "FORBIDDEN" | "VALIDATION" | "NOT_FOUND"] ?? 503)
      : 503;
    return Response.json({ error: "暫時無法更新月份，請確認登入與門市權限後重試" }, { status, headers });
  }
}
