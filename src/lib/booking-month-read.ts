import { refreshBookingManagement } from "@/server/actions/booking-refresh";

import { nextCustomerLabelRevision } from "@/lib/customer-labels";

type Snapshot = Awaited<ReturnType<typeof refreshBookingManagement>>;

export async function readBookingMonth(input: { year: number; month: number; storeId?: string; date?: string | null }): Promise<Snapshot> {
  const revision = nextCustomerLabelRevision();
  // ADMIN's all-store scope retains the established session-resolved action.
  if (!input.storeId) {
    const snapshot = await refreshBookingManagement({ ...input, date: input.date ?? null });
    if (snapshot?.customerLabels) snapshot.customerLabels = { ...snapshot.customerLabels, clientRevision: revision };
    return snapshot;
  }
  const params = new URLSearchParams({ year: String(input.year), month: String(input.month), storeId: input.storeId });
  if (input.date) params.set("date", input.date);
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
  if (!snapshot || !Array.isArray(snapshot.monthData) || !snapshot.monthSchedule || (snapshot.slots !== null && (!input.date || !Array.isArray(snapshot.slots)))) {
    throw new Error("月份資料格式異常");
  }
  if (snapshot.customerLabels) snapshot.customerLabels = { ...snapshot.customerLabels, clientRevision: revision };
  return snapshot;
}
