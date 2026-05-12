/**
 * customer-list-helpers — 顧客列表純函式 helpers
 *
 * 拆出來的理由：方便 vitest 直接 import 測試，不會把 next-auth /
 * session 等 side-effect 一起拉進來。
 */

/**
 * Pure helper: 用 booking groupBy 結果蓋掉 customer 的 lastVisitAt 顯示值。
 *
 * 規則：
 *   - 有 COMPLETED booking → 用該 booking 的最新 bookingDate
 *   - 無 COMPLETED booking → 退回 Customer.lastVisitAt（極少數舊資料場景）
 *
 * 為什麼這樣設計：prod 多數 Customer.lastVisitAt 是 stale/null，但顧客
 * 其實有 COMPLETED bookings。本 helper 讓「列表顯示」用 booking 真實
 * 結果，不 backfill、不動 booking 完成流程、不動 schema。
 *
 * Known limitation（listCustomers 使用處的 comment 已記）：
 *   - visit filter 與 sort 仍使用 Customer.lastVisitAt，未在本 PR 修正。
 */
export function overrideLastVisitFromCompletedBookings<
  T extends { id: string; lastVisitAt: Date | null },
>(
  customers: T[],
  bookingGroups: Array<{
    customerId: string;
    _max: { bookingDate: Date | null };
  }>,
): T[] {
  const lastVisitMap = new Map<string, Date | null>(
    bookingGroups.map((r) => [r.customerId, r._max.bookingDate]),
  );
  return customers.map((c) => ({
    ...c,
    lastVisitAt: lastVisitMap.get(c.id) ?? c.lastVisitAt,
  }));
}
