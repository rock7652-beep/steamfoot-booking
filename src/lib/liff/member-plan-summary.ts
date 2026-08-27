/**
 * LIFF 首頁「方案摘要」使用全會員口徑：
 * - 可使用：目前有效方案尚未完成使用的堂數（含已保留堂數）
 * - 已預約：會員所有未來有效預約人數，不限是否綁定目前方案
 * - 尚可預約：目前有效方案仍可建立新預約的堂數
 */
export function getMemberPlanSummary(
  wallets: Array<{ remainingSessions: number; availableToBook: number }>,
  upcomingBookings: Array<{ people: number }>,
) {
  return {
    totalUsable: wallets.reduce(
      (sum, wallet) => sum + wallet.remainingSessions,
      0,
    ),
    totalBooked: upcomingBookings.reduce(
      (sum, booking) => sum + booking.people,
      0,
    ),
    totalBookable: wallets.reduce(
      (sum, wallet) => sum + wallet.availableToBook,
      0,
    ),
  };
}
