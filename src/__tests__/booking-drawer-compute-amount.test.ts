/**
 * PR-D1C — booking-detail-drawer.computeAmount 顯示金額容錯測試
 *
 * 背景：
 *   LIFF FIRST_TRIAL 預約在後台 drawer 顯示「NT$—」，根因是歷史 trial
 *   ServicePlan.price=0（ensureTrialPlan 不更新既有 plan 價格）。
 *
 * 修法（PR-D1C, UI-only）：
 *   FIRST_TRIAL → planPrice > 0 ? planPrice : trial.settings.defaultPrice
 *   不動 schema / 不動 server payload / 不動 collectTrialPayment / 不動
 *   createBooking。
 *
 * 本檔鎖定 6 種情境：
 *   1. FIRST_TRIAL plan.price>0          → 用 plan.price
 *   2. FIRST_TRIAL plan.price=0          → 用 trial.settings.defaultPrice
 *   3. FIRST_TRIAL plan null & trial null → "—"（防禦：兩邊都沒有 → 不誇大）
 *   4. SINGLE plan.price>0               → 沿用既有顯示（不受 PR-D1C 影響）
 *   5. PACKAGE_SESSION sessionCount>1    → 沿用既有「每堂」顯示
 *   6. isMakeup=true                     → 「補課（免費）」（永遠先於 type 判斷）
 */

import { describe, it, expect } from "vitest";
import { computeAmount } from "@/app/(dashboard)/dashboard/bookings/compute-amount";
import type { BookingDrawerPayload } from "@/server/actions/booking-drawer";

type Booking = BookingDrawerPayload["booking"];
type Trial = BookingDrawerPayload["trial"];

/** 建立最小有效 booking payload。callers 只覆寫他們關心的欄位。 */
function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "bk_test",
    bookingDate: "2026-05-23",
    slotTime: "10:00",
    bookingStatus: "CONFIRMED",
    bookingType: "FIRST_TRIAL",
    people: 1,
    isMakeup: false,
    isCheckedIn: false,
    notes: null,
    customer: { id: "c1", name: "測試顧客", phone: "0900000000" },
    revenueStaff: null,
    serviceStaff: null,
    servicePlan: null,
    customerPlanWallet: null,
    expectedAmount: null,
    ...overrides,
  };
}

/** 建立有效的 trial 區塊（FIRST_TRIAL 才會有）。 */
function makeTrial(overrides: Partial<NonNullable<Trial>> = {}): NonNullable<Trial> {
  return {
    collected: false,
    collectedAmount: null,
    collectedMethod: null,
    collectedAt: null,
    collectedTransactionId: null,
    canCorrect: false,
    settings: {
      allowEdit: false,
      defaultPrice: 499,
      minPrice: 0,
      maxPrice: 2000,
    },
    ...overrides,
  };
}

describe("computeAmount — PR-D1C FIRST_TRIAL fallback", () => {
  it("FIRST_TRIAL：plan.price > 0 → 用 plan.price（不走 fallback）", () => {
    const booking = makeBooking({
      bookingType: "FIRST_TRIAL",
      servicePlan: {
        id: "plan_trial",
        name: "體驗",
        price: 599,
        sessionCount: 1,
        category: "TRIAL",
      },
    });
    const trial = makeTrial({ settings: { allowEdit: false, defaultPrice: 499, minPrice: 0, maxPrice: 2000 } });
    expect(computeAmount(booking, trial)).toBe("NT$ 599");
  });

  it("FIRST_TRIAL：plan.price=0 → 用 trial.settings.defaultPrice（修 NT$— bug）", () => {
    const booking = makeBooking({
      bookingType: "FIRST_TRIAL",
      servicePlan: {
        id: "plan_trial_legacy",
        name: "體驗",
        price: 0,
        sessionCount: 1,
        category: "TRIAL",
      },
    });
    const trial = makeTrial({ settings: { allowEdit: false, defaultPrice: 499, minPrice: 0, maxPrice: 2000 } });
    expect(computeAmount(booking, trial)).toBe("NT$ 499");
  });

  it("FIRST_TRIAL：plan null + trial null → '—'（兩邊都沒有，不誇大）", () => {
    const booking = makeBooking({
      bookingType: "FIRST_TRIAL",
      servicePlan: null,
    });
    expect(computeAmount(booking, null)).toBe("—");
  });

  it("SINGLE：plan.price > 0 → 「NT$ {price}」（PR-D1C 不影響 SINGLE）", () => {
    const booking = makeBooking({
      bookingType: "SINGLE",
      servicePlan: {
        id: "plan_single",
        name: "單次",
        price: 799,
        sessionCount: 1,
        category: "SINGLE",
      },
    });
    expect(computeAmount(booking, null)).toBe("NT$ 799");
  });

  it("PACKAGE_SESSION sessionCount>1 → 顯示「每堂」與方案總價", () => {
    const booking = makeBooking({
      bookingType: "PACKAGE_SESSION",
      servicePlan: {
        id: "plan_pkg",
        name: "10 堂方案",
        price: 6500,
        sessionCount: 10,
        category: "PACKAGE",
      },
    });
    expect(computeAmount(booking, null)).toBe(
      "≈ NT$ 650 / 堂（方案 NT$ 6,500）",
    );
  });

  it("isMakeup=true → 「補課（免費）」（永遠先於 bookingType 判斷）", () => {
    const booking = makeBooking({
      bookingType: "FIRST_TRIAL",
      isMakeup: true,
      servicePlan: {
        id: "plan_trial",
        name: "體驗",
        price: 0,
        sessionCount: 1,
        category: "TRIAL",
      },
    });
    const trial = makeTrial();
    // makeup 永遠免費；不應該因為 PR-D1C fallback 而顯示 NT$499
    expect(computeAmount(booking, trial)).toBe("補課（免費）");
  });
});
