/**
 * Pure helpers for booking-detail-drawer + day-detail-panel 顯示金額。
 *
 * PR-D1C：FIRST_TRIAL 顯示金額容錯（drawer）。
 *   歷史 trial ServicePlan.price=0（ensureTrialPlan 不更新既有 plan 價格），
 *   導致 LIFF FIRST_TRIAL 在 drawer 顯示「NT$—」。
 *
 * PR-D1D：同一 fallback 規則延伸到 day-detail-panel 的 badge — 抽出
 *   `resolveTrialDisplayAmount` 純函數，兩處共用。drawer 端帶 `planPrice`，
 *   panel 端帶 `expectedAmount`（已是建立時快照），fallback 來源都是 store
 *   的 `trialDefaultPrice`。不動 schema / 不動 collectTrialPayment / 不動
 *   createBooking / 不動 LIFF action — 僅顯示層補洞。
 */

import type { BookingDrawerPayload } from "@/server/actions/booking-drawer";

/**
 * 體驗預約金額容錯：planPrice > 0 用 planPrice；否則退到 trialDefaultPrice；
 * 兩個都不可用 → null（caller render 成 "—"）。
 *
 * caller 自負語意：drawer 帶 `servicePlan.price`、panel 帶 `expectedAmount`，
 * 兩者都是「該 booking 期望金額快照」這個語意位置，僅來源欄位不同。
 */
export function resolveTrialDisplayAmount(input: {
  planPrice: number | null | undefined;
  trialDefaultPrice: number | null | undefined;
}): number | null {
  const plan = input.planPrice ?? 0;
  if (plan > 0) return plan;
  const fallback = input.trialDefaultPrice ?? 0;
  return fallback > 0 ? fallback : null;
}

export function computeAmount(
  booking: BookingDrawerPayload["booking"],
  trial: BookingDrawerPayload["trial"],
): string {
  if (booking.isMakeup) return "補課（免費）";

  if (booking.bookingType === "FIRST_TRIAL") {
    const display = resolveTrialDisplayAmount({
      planPrice: booking.servicePlan?.price,
      trialDefaultPrice: trial?.settings.defaultPrice,
    });
    return display == null ? "—" : `NT$ ${display.toLocaleString()}`;
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
