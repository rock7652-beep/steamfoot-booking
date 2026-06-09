/**
 * booking-detail-drawer.computeAmount 顯示金額容錯測試
 *
 * 歷史背景：
 *   - PR-D1C：LIFF FIRST_TRIAL 預約在後台 drawer 顯示「NT$—」，根因是
 *     歷史 trial ServicePlan.price=0（ensureTrialPlan 不更新既有 plan）。
 *     解法：planPrice > 0 ? planPrice : trial.settings.defaultPrice。
 *   - PR-D1D：同一 fallback 抽出 resolveTrialDisplayAmount，day-detail-panel
 *     badge 共用。
 *   - PR-3c：人數 × 單價 = 本次總額。helper 改名：
 *       planPrice → snapshotTotal（booking.expectedAmount / collectedAmount，
 *         已是 N 人合計，**不再 × people**）
 *       trialDefaultPrice → unitFallback（單價，需 × people 才是總額）
 *     並新增 `people` 參數。computeAmount 對 FIRST_TRIAL 優先用
 *     booking.expectedAmount 作 snapshotTotal，缺值才退到 unitFallback × people。
 *
 * 本檔保留既有 6 case regression（人數=1 等價於 PR-D1C 行為），下方新增
 * PR-3c people-aware cases 鎖定新合約。
 */

import { describe, it, expect } from "vitest";
import {
  computeAmount,
  resolveTrialDisplayAmount,
} from "@/app/(dashboard)/dashboard/bookings/compute-amount";
import type { BookingDrawerPayload } from "@/server/actions/booking-drawer";

type Booking = BookingDrawerPayload["booking"];
type Trial = BookingDrawerPayload["trial"];

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
    customer: {
      id: "c1",
      name: "測試顧客",
      phone: "0900000000",
      serviceNote: null,
    },
    revenueStaff: null,
    serviceStaff: null,
    servicePlan: null,
    customerPlanWallet: null,
    expectedAmount: null,
    attendedPeople: null,
    ...overrides,
  };
}

function makeTrial(
  overrides: Partial<NonNullable<Trial>> = {},
): NonNullable<Trial> {
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

describe("computeAmount — PR-D1C FIRST_TRIAL fallback (people=1)", () => {
  it("FIRST_TRIAL：plan.price > 0 → 用 plan.price（人數=1 = 單價）", () => {
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
    const trial = makeTrial();
    expect(computeAmount(booking, trial)).toBe("NT$ 599");
  });

  it("FIRST_TRIAL：plan.price=0 → 用 trial.settings.defaultPrice（PR-D1C bug 修復）", () => {
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
    const trial = makeTrial();
    expect(computeAmount(booking, trial)).toBe("NT$ 499");
  });

  it("FIRST_TRIAL：plan null + trial null → '—'", () => {
    const booking = makeBooking({
      bookingType: "FIRST_TRIAL",
      servicePlan: null,
    });
    expect(computeAmount(booking, null)).toBe("—");
  });

  it("SINGLE：plan.price > 0 → 「NT$ {price}」（不受 trial 邏輯影響）", () => {
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
    expect(computeAmount(booking, trial)).toBe("補課（免費）");
  });
});

/**
 * PR-3c — computeAmount people-aware 行為
 *
 *   - booking.expectedAmount 有值 → 視為「本次合計」快照，直接顯示（不再 × people）
 *   - booking.expectedAmount 缺值 → 退到 plan.price / store default 「單價」× people
 */
describe("computeAmount — PR-3c people × amount", () => {
  it("expectedAmount=998（雙人合計快照）→ 顯示 998，不重複 ×", () => {
    const booking = makeBooking({
      bookingType: "FIRST_TRIAL",
      people: 2,
      expectedAmount: 998,
      servicePlan: {
        id: "plan_trial",
        name: "體驗",
        price: 499,
        sessionCount: 1,
        category: "TRIAL",
      },
    });
    const trial = makeTrial();
    expect(computeAmount(booking, trial)).toBe("NT$ 998");
  });

  it("expectedAmount=899（雙人促銷手動覆蓋）→ 顯示 899", () => {
    const booking = makeBooking({
      bookingType: "FIRST_TRIAL",
      people: 2,
      expectedAmount: 899,
      servicePlan: {
        id: "plan_trial",
        name: "體驗",
        price: 499,
        sessionCount: 1,
        category: "TRIAL",
      },
    });
    expect(computeAmount(booking, makeTrial())).toBe("NT$ 899");
  });

  it("expectedAmount=null + people=2 → fallback plan.price 499 × 2 = 998", () => {
    const booking = makeBooking({
      bookingType: "FIRST_TRIAL",
      people: 2,
      expectedAmount: null,
      servicePlan: {
        id: "plan_trial",
        name: "體驗",
        price: 499,
        sessionCount: 1,
        category: "TRIAL",
      },
    });
    expect(computeAmount(booking, makeTrial())).toBe("NT$ 998");
  });

  it("expectedAmount=null + plan.price=0 + people=3 → fallback default 499 × 3 = 1,497", () => {
    const booking = makeBooking({
      bookingType: "FIRST_TRIAL",
      people: 3,
      expectedAmount: null,
      servicePlan: {
        id: "plan_trial_legacy",
        name: "體驗",
        price: 0,
        sessionCount: 1,
        category: "TRIAL",
      },
    });
    expect(computeAmount(booking, makeTrial())).toBe("NT$ 1,497");
  });
});

/**
 * resolveTrialDisplayAmount — PR-3c 新合約
 *
 * snapshotTotal > 0 → 直接用（已是合計）
 * snapshotTotal 缺 → unitFallback > 0 ? unitFallback × people : null
 * people 缺 / <1 → 預設 1
 */
describe("resolveTrialDisplayAmount — PR-3c new contract", () => {
  it("snapshotTotal=998 → 998（people 不影響）", () => {
    expect(
      resolveTrialDisplayAmount({
        snapshotTotal: 998,
        unitFallback: 499,
        people: 2,
      }),
    ).toBe(998);
  });

  it("snapshotTotal=null + unitFallback=499 + people=1 → 499", () => {
    expect(
      resolveTrialDisplayAmount({
        snapshotTotal: null,
        unitFallback: 499,
        people: 1,
      }),
    ).toBe(499);
  });

  it("snapshotTotal=null + unitFallback=499 + people=2 → 998", () => {
    expect(
      resolveTrialDisplayAmount({
        snapshotTotal: null,
        unitFallback: 499,
        people: 2,
      }),
    ).toBe(998);
  });

  it("snapshotTotal=null + unitFallback=499 + people=4 → 1996", () => {
    expect(
      resolveTrialDisplayAmount({
        snapshotTotal: null,
        unitFallback: 499,
        people: 4,
      }),
    ).toBe(1996);
  });

  it("snapshotTotal=null + unitFallback=null → null（無資料）", () => {
    expect(
      resolveTrialDisplayAmount({
        snapshotTotal: null,
        unitFallback: null,
        people: 2,
      }),
    ).toBeNull();
  });

  it("snapshotTotal=0 + unitFallback=499 + people=2 → fallback × people = 998", () => {
    // PR-D1D 舊規則：planPrice=0 視為「未知」走 fallback。PR-3c 沿用：
    // snapshotTotal<=0 視為缺值。
    expect(
      resolveTrialDisplayAmount({
        snapshotTotal: 0,
        unitFallback: 499,
        people: 2,
      }),
    ).toBe(998);
  });

  it("snapshotTotal=undefined + unitFallback=undefined → null", () => {
    expect(
      resolveTrialDisplayAmount({
        snapshotTotal: undefined,
        unitFallback: undefined,
        people: 1,
      }),
    ).toBeNull();
  });

  it("people=0（防禦）→ 視為 1", () => {
    expect(
      resolveTrialDisplayAmount({
        snapshotTotal: null,
        unitFallback: 499,
        people: 0,
      }),
    ).toBe(499);
  });

  it("people=null（防禦）→ 視為 1", () => {
    expect(
      resolveTrialDisplayAmount({
        snapshotTotal: null,
        unitFallback: 499,
        people: null,
      }),
    ).toBe(499);
  });

  it("負 snapshotTotal（不可能值）→ 退 fallback × people", () => {
    expect(
      resolveTrialDisplayAmount({
        snapshotTotal: -100,
        unitFallback: 499,
        people: 2,
      }),
    ).toBe(998);
  });
});
