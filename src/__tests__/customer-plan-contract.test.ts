/**
 * Regression: customer-plan-contract 唯一真相
 *
 * 守則：
 *   totalRemainingSessions  = Σ wallet.remainingSessions (ACTIVE)
 *   reservedPendingSessions = Σ count(BOOKING_UPCOMING && !isMakeup) on ACTIVE wallets
 *   availableSessions       = max(0, totalRemainingSessions - reservedPendingSessions)
 *
 * 防止以下歷史 bug 復發：
 *   - book/page.tsx 用 totalSessions - sum(people)，與 my-plans 用 remainingSessions - count
 *     兩者答案不同 → 顧客四個頁面看到四個數字
 *   - 補課 booking 被誤計入 reservedPending → 多扣
 *   - CANCELLED booking 被誤計入 reservedPending → 取消後仍不能再約
 */

import { describe, it, expect } from "vitest";
import {
  computeWalletSummary,
  countReservedPending,
  aggregateCustomerSummary,
  type CustomerPlanWalletBookingRow,
} from "@/lib/customer-plan-contract";

const baseBookingRow = (overrides: Partial<CustomerPlanWalletBookingRow>): CustomerPlanWalletBookingRow => ({
  bookingDate: new Date("2026-04-27T00:00:00Z"),
  slotTime: "10:00",
  bookingStatus: "PENDING",
  isMakeup: false,
  people: 1,
  noShowPolicy: null,
  ...overrides,
});

// ============================================================
// countReservedPending — 唯一定義純函式
// ============================================================

describe("countReservedPending — pending 定義唯一來源", () => {
  it("空陣列 → 0", () => {
    expect(countReservedPending([])).toBe(0);
  });

  it("PENDING + CONFIRMED 各 1 筆 → 2", () => {
    const bookings = [
      baseBookingRow({ bookingStatus: "PENDING" }),
      baseBookingRow({ bookingStatus: "CONFIRMED" }),
    ];
    expect(countReservedPending(bookings)).toBe(2);
  });

  it("補課 PENDING booking 不計入 reservedPending", () => {
    const bookings = [
      baseBookingRow({ bookingStatus: "PENDING", isMakeup: false }),
      baseBookingRow({ bookingStatus: "PENDING", isMakeup: true }), // 補課
    ];
    expect(countReservedPending(bookings)).toBe(1);
  });

  it("CANCELLED 不計入（取消後不該卡 reserved）", () => {
    const bookings = [
      baseBookingRow({ bookingStatus: "PENDING" }),
      baseBookingRow({ bookingStatus: "CANCELLED" }),
    ];
    expect(countReservedPending(bookings)).toBe(1);
  });

  it("COMPLETED / NO_SHOW 不計入（已結束）", () => {
    const bookings = [
      baseBookingRow({ bookingStatus: "PENDING" }),
      baseBookingRow({ bookingStatus: "COMPLETED" }),
      baseBookingRow({ bookingStatus: "NO_SHOW" }),
    ];
    expect(countReservedPending(bookings)).toBe(1);
  });
});

// ============================================================
// computeWalletSummary — 單一 wallet 契約欄位
// ============================================================

describe("computeWalletSummary — 單一 wallet 契約", () => {
  const baseWallet = {
    id: "w1",
    plan: { name: "課程 10 堂", category: "PACKAGE", sessionCount: 10 },
    status: "ACTIVE" as const,
    totalSessions: 10,
    remainingSessions: 10,
    startDate: new Date("2026-01-01"),
    expiryDate: null,
  };

  it("無 booking → reservedPending=0、availableToBook=remainingSessions", () => {
    const summary = computeWalletSummary({ ...baseWallet, bookings: [] });
    expect(summary.reservedPending).toBe(0);
    expect(summary.availableToBook).toBe(10);
  });

  it("3 筆 PENDING → reservedPending=3、availableToBook=7", () => {
    const summary = computeWalletSummary({
      ...baseWallet,
      bookings: [
        baseBookingRow({ bookingStatus: "PENDING" }),
        baseBookingRow({ bookingStatus: "PENDING" }),
        baseBookingRow({ bookingStatus: "PENDING" }),
      ],
    });
    expect(summary.reservedPending).toBe(3);
    expect(summary.availableToBook).toBe(7);
  });

  it("remainingSessions 已扣完 + 1 筆 PENDING → availableToBook=0（不為負）", () => {
    const summary = computeWalletSummary({
      ...baseWallet,
      remainingSessions: 0,
      bookings: [baseBookingRow({ bookingStatus: "PENDING" })],
    });
    expect(summary.availableToBook).toBe(0);
  });

  it("補課 PENDING 不影響 reservedPending / availableToBook", () => {
    const summary = computeWalletSummary({
      ...baseWallet,
      bookings: [
        baseBookingRow({ bookingStatus: "PENDING", isMakeup: false }),
        baseBookingRow({ bookingStatus: "PENDING", isMakeup: true }),
      ],
    });
    expect(summary.reservedPending).toBe(1);
    expect(summary.availableToBook).toBe(9);
  });
});

// ============================================================
// aggregateCustomerSummary — customer-level 聚合
// ============================================================

describe("aggregateCustomerSummary — customer 級聚合", () => {
  it("多個 ACTIVE wallet 聚合：total = Σ remaining，reserved = Σ pending，available = total - reserved", () => {
    const w1 = computeWalletSummary({
      id: "w1",
      plan: { name: "P1", category: "PACKAGE", sessionCount: 10 },
      status: "ACTIVE",
      totalSessions: 10,
      remainingSessions: 8,
      startDate: new Date(),
      expiryDate: null,
      bookings: [baseBookingRow({ bookingStatus: "PENDING" })],
    });
    const w2 = computeWalletSummary({
      id: "w2",
      plan: { name: "P2", category: "PACKAGE", sessionCount: 5 },
      status: "ACTIVE",
      totalSessions: 5,
      remainingSessions: 5,
      startDate: new Date(),
      expiryDate: null,
      bookings: [
        baseBookingRow({ bookingStatus: "PENDING" }),
        baseBookingRow({ bookingStatus: "CONFIRMED" }),
      ],
    });

    const summary = aggregateCustomerSummary({
      customerId: "c1",
      storeId: "s1",
      wallets: [w1, w2],
    });
    expect(summary.totalRemainingSessions).toBe(13); // 8 + 5
    expect(summary.reservedPendingSessions).toBe(3); // 1 + 2
    expect(summary.availableSessions).toBe(10); // 13 - 3
    expect(summary.hasActivePlan).toBe(true);
  });

  it("EXPIRED / USED_UP / CANCELLED wallet 不計入 totals", () => {
    const active = computeWalletSummary({
      id: "active",
      plan: { name: "A", category: "PACKAGE", sessionCount: 10 },
      status: "ACTIVE",
      totalSessions: 10,
      remainingSessions: 10,
      startDate: new Date(),
      expiryDate: null,
      bookings: [],
    });
    const expired = computeWalletSummary({
      id: "expired",
      plan: { name: "E", category: "PACKAGE", sessionCount: 5 },
      status: "EXPIRED",
      totalSessions: 5,
      remainingSessions: 3, // 仍有剩餘但 EXPIRED → 不計
      startDate: new Date(),
      expiryDate: new Date("2025-01-01"),
      bookings: [],
    });
    const usedUp = computeWalletSummary({
      id: "u",
      plan: { name: "U", category: "PACKAGE", sessionCount: 5 },
      status: "USED_UP",
      totalSessions: 5,
      remainingSessions: 0,
      startDate: new Date(),
      expiryDate: null,
      bookings: [],
    });

    const summary = aggregateCustomerSummary({
      customerId: "c1",
      storeId: "s1",
      wallets: [active, expired, usedUp],
    });
    expect(summary.totalRemainingSessions).toBe(10);
    expect(summary.activeWallets).toHaveLength(1);
    expect(summary.expiredWallets).toHaveLength(1);
    expect(summary.historyWallets).toHaveLength(1);
  });

  it("availableSessions 永遠不為負（極端情境：reserved > remaining）", () => {
    // 不該發生，但若某 wallet remainingSessions 異常滯後，contract 守住底線
    const buggy = computeWalletSummary({
      id: "buggy",
      plan: { name: "B", category: "PACKAGE", sessionCount: 5 },
      status: "ACTIVE",
      totalSessions: 5,
      remainingSessions: 1,
      startDate: new Date(),
      expiryDate: null,
      bookings: [
        baseBookingRow({ bookingStatus: "PENDING" }),
        baseBookingRow({ bookingStatus: "PENDING" }),
        baseBookingRow({ bookingStatus: "PENDING" }),
      ],
    });
    const summary = aggregateCustomerSummary({
      customerId: "c1",
      storeId: "s1",
      wallets: [buggy],
    });
    expect(summary.availableSessions).toBe(0);
    expect(summary.availableSessions).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// 契約引用測試 — 確保常數使用 BOOKING_UPCOMING 而非 inline 字串
// ============================================================

describe("Status 集合契約 — 與 booking-constants 對齊", () => {
  it("countReservedPending 使用 BOOKING_UPCOMING 集合", async () => {
    const { BOOKING_UPCOMING } = await import("@/lib/booking-constants");
    // 對 BOOKING_UPCOMING 的每個值，countReservedPending 都應計入
    for (const status of BOOKING_UPCOMING) {
      const bookings = [baseBookingRow({ bookingStatus: status, isMakeup: false })];
      expect(countReservedPending(bookings)).toBe(1);
    }
  });

  it("BOOKING_HISTORY 的狀態都不被 countReservedPending 計入", async () => {
    const { BOOKING_HISTORY } = await import("@/lib/booking-constants");
    for (const status of BOOKING_HISTORY) {
      const bookings = [baseBookingRow({ bookingStatus: status, isMakeup: false })];
      expect(countReservedPending(bookings)).toBe(0);
    }
  });
});
