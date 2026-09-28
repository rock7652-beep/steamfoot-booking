import { fetchBookingDetail, type BookingDrawerPayload } from "@/server/actions/booking-drawer";
import type { markCompleted } from "@/server/actions/booking";

export async function readBookingDetail(id: string, storeId?: string): Promise<BookingDrawerPayload> {
  if (!storeId) return fetchBookingDetail(id);
  const params = new URLSearchParams({ bookingId: id, storeId });
  const response = await fetch(`/api/bookings/detail?${params}`, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("預約明細暫時無法載入");
  const payload: BookingDrawerPayload = await response.json();
  if (payload?.booking?.id !== id) throw new Error("預約明細不符");
  return payload;
}

export async function updateBookingStatus(
  bookingId: string, operation: "complete" | "revert", input?: Parameters<typeof markCompleted>[1],
): Promise<{ success: boolean; error?: string }> {
  const response = await fetch("/api/bookings/status", {
    method: "POST", cache: "no-store", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId, operation, input }),
  });
  if (!response.ok) throw new Error("操作結果待確認");
  const result = await response.json();
  if (typeof result?.success !== "boolean") throw new Error("操作結果待確認");
  return result;
}

/** Read slots without a Server Action page payload; server retains session scope. */
export async function readBookingSlots(date: string): Promise<{ slots: import("@/types").SlotAvailability[] }> {
  const response = await fetch(`/api/bookings/slots?${new URLSearchParams({ date })}`, {
    cache: "no-store", credentials: "same-origin",
  });
  if (!response.ok) throw new Error("時段暫時無法載入");
  const result = await response.json();
  if (!Array.isArray(result?.slots)) throw new Error("時段資料格式異常");
  return result;
}
