import { refreshBookingManagement } from "@/server/actions/booking-refresh";

type Snapshot = Awaited<ReturnType<typeof refreshBookingManagement>>;

export async function readBookingMonth(input: { year: number; month: number; storeId?: string }): Promise<Snapshot> {
  // ADMIN's all-store scope retains the established session-resolved action.
  if (!input.storeId) return refreshBookingManagement({ ...input, date: null });
  const params = new URLSearchParams({ year: String(input.year), month: String(input.month), storeId: input.storeId });
  const response = await fetch(`/api/bookings/month?${params}`, {
    cache: "no-store", credentials: "same-origin",
  });
  if (!response.ok) throw new Error("月份更新失敗，請重試");
  // Preserve the two Date fields delivered by the existing RSC DTO. Other
  // strings, including notes and the business-date key, remain unchanged.
  const snapshot: Snapshot = JSON.parse(await response.text(), (key, value) => {
    if ((key === "customerConfirmedAt" || key === "expiryDate") && typeof value === "string") {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) throw new Error("月份資料格式異常");
      return date;
    }
    return value;
  });
  if (!snapshot || !Array.isArray(snapshot.monthData) || !snapshot.monthSchedule || snapshot.slots !== null) {
    throw new Error("月份資料格式異常");
  }
  return snapshot;
}
