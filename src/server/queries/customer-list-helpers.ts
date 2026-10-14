/**
 * customer-list-helpers — 顧客列表純函式 helpers
 *
 * 拆出來的理由：方便 vitest 直接 import 測試，不會把 next-auth /
 * session 等 side-effect 一起拉進來。
 */

/**
 * 顧客清單顯示最近完成的到店日期，合併預約本人及同行者的完成紀錄。
 * 若沒有可用的完成紀錄，保留 Customer.lastVisitAt 作為舊資料備援。
 */
export function overrideLastVisitFromCompletedBookings<
  T extends { id: string; lastVisitAt: Date | null },
>(
  customers: T[],
  bookingGroups: Array<{
    customerId: string;
    _max: { bookingDate: Date | null };
  }>,
  participantVisits: Array<{
    customerId: string | null;
    bookingDate: Date | null;
  }> = [],
): T[] {
  const lastVisitMap = new Map<string, Date>();
  for (const booking of bookingGroups) {
    const date = booking._max.bookingDate;
    if (!date) continue;
    const current = lastVisitMap.get(booking.customerId);
    if (!current || date > current) lastVisitMap.set(booking.customerId, date);
  }
  for (const visit of participantVisits) {
    if (!visit.customerId || !visit.bookingDate) continue;
    const current = lastVisitMap.get(visit.customerId);
    if (!current || visit.bookingDate > current) lastVisitMap.set(visit.customerId, visit.bookingDate);
  }
  return customers.map((customer) => ({
    ...customer,
    lastVisitAt: lastVisitMap.get(customer.id) ?? customer.lastVisitAt,
  }));
}
