/**
 * Pure helper for booking-detail-drawer 顯示金額。
 *
 * PR-D1C：FIRST_TRIAL 顯示金額容錯。
 *   歷史 trial ServicePlan.price=0（ensureTrialPlan 不更新既有 plan 價格），
 *   導致 LIFF FIRST_TRIAL 在 drawer 顯示「NT$—」。修法純 UI：
 *     planPrice > 0 → 用 planPrice；否則 → 用 trial.settings.defaultPrice
 *
 *   不動 schema / 不動 server payload / 不動 collectTrialPayment / 不動
 *   createBooking。本檔抽離 .tsx 純為了在 vitest 可獨立 import（不會把
 *   client 的 React 樹 + server action 的 prisma 入口拉進測試）。
 */

import type { BookingDrawerPayload } from "@/server/actions/booking-drawer";

export function computeAmount(
  booking: BookingDrawerPayload["booking"],
  trial: BookingDrawerPayload["trial"],
): string {
  if (booking.isMakeup) return "補課（免費）";

  if (booking.bookingType === "FIRST_TRIAL") {
    const planPrice = booking.servicePlan?.price ?? 0;
    const fallback = trial?.settings.defaultPrice ?? 0;
    const display = planPrice > 0 ? planPrice : fallback;
    return display > 0 ? `NT$ ${display.toLocaleString()}` : "—";
  }

  if (!booking.servicePlan) return "—";
  const price = booking.servicePlan.price;
  if (!price) return "—";
  if (
    booking.bookingType === "PACKAGE_SESSION" &&
    booking.servicePlan.sessionCount > 1
  ) {
    const per = Math.round(price / booking.servicePlan.sessionCount);
    return `≈ NT$ ${per.toLocaleString()} / 堂（方案 NT$ ${price.toLocaleString()}）`;
  }
  return `NT$ ${price.toLocaleString()}`;
}
