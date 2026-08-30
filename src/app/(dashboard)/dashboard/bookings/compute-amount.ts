/**
 * Pure helpers for booking-detail-drawer + day-detail-panel 顯示金額。
 *
 * PR-D1C：FIRST_TRIAL 顯示金額容錯（drawer）。
 *   歷史 trial ServicePlan.price=0（ensureTrialPlan 不更新既有 plan 價格），
 *   導致 LIFF FIRST_TRIAL 在 drawer 顯示「NT$—」。
 *
 * PR-D1D：同一 fallback 規則延伸到 day-detail-panel 的 badge — 抽出
 *   `resolveTrialDisplayAmount` 純函數，兩處共用。
 *
 * PR-3c：people-aware 顯示。`snapshotTotal` 為既存的「本次總額」快照
 *   （booking.expectedAmount / collectedAmount）— 已是 N 人合計，**不再
 *   × people**；`unitFallback`（store trialDefaultPrice 或 plan.price）
 *   是單價 — 需 × people 才能顯示總額。`people` 預設 1，缺值不致 NaN。
 */

import type { BookingDrawerPayload } from "@/server/actions/booking-drawer";

/**
 * 體驗預約「本次總額」顯示容錯。
 *
 *   - snapshotTotal > 0 → 用快照（PR-3c 起即為總額；舊資料若仍是單價，這
 *     裡會直接顯示原值，需要靠 server clamp 與資料更新逐步收斂）
 *   - 否則退到 unitFallback × people（單價乘人數 → 總額）
 *   - 兩者都不可用 → null（caller render 成 "—"）
 *
 * 注意 snapshotTotal 與 unitFallback 的語意差異：前者已是合計，後者是單價。
 */
export function resolveTrialDisplayAmount(input: {
  snapshotTotal: number | null | undefined;
  unitFallback: number | null | undefined;
  people: number | null | undefined;
}): number | null {
  const snap = input.snapshotTotal ?? 0;
  if (snap > 0) return snap;
  const unit = input.unitFallback ?? 0;
  if (unit <= 0) return null;
  const n = Math.max(1, Math.floor(input.people || 1));
  return unit * n;
}

export function computeAmount(
  booking: BookingDrawerPayload["booking"],
  trial: BookingDrawerPayload["trial"],
): string {
  if (booking.isMakeup) return "補課（免費）";

  if (booking.bookingType === "FIRST_TRIAL") {
    // 體驗：顯示「本次總額」。
    //   1) snapshotTotal=booking.expectedAmount（PR-3c 起為合計快照）
    //   2) 缺值才退到「單價」× people：先試 plan.price（>0），再退到
    //      store trialDefaultPrice。歷史 trial plan.price=0 必須漏到 store default
    //      才能修 PR-D1C 的 NT$— bug。
    const planUnit = booking.servicePlan?.price;
    const storeUnit = trial?.settings.defaultPrice;
    const unitFallback =
      planUnit != null && planUnit > 0 ? planUnit : storeUnit;
    const display = resolveTrialDisplayAmount({
      snapshotTotal: booking.expectedAmount,
      unitFallback,
      people: booking.people,
    });
    return display == null ? "—" : `NT$ ${display.toLocaleString()}`;
  }

  // SPA 單次服務的應收金額必須以「預約成立時的價格快照」為準。
  // ServicePlan.price 是目前價目表價格，療程日後調價時不可回寫既有預約，
  // 否則同一張預約的詳情與現場結帳會顯示不同金額。
  if (
    booking.bookingType === "SINGLE" &&
    booking.treatmentPriceSnapshot != null &&
    booking.treatmentPriceSnapshot > 0
  ) {
    return `NT$ ${booking.treatmentPriceSnapshot.toLocaleString()}`;
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
