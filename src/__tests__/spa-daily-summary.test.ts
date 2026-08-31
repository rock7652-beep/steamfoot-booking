import { describe, expect, it } from "vitest";
import { buildSpaDailySummary } from "@/lib/spa-daily-summary";
import type { SpaDemoBooking, SpaDemoProvider } from "@/lib/spa-demo-store";

const providers = [
  { id: "staff-08", badge: "08", name: "陳語安" },
  { id: "staff-10", badge: "10", name: "張若琳" },
  { id: "staff-07", badge: "07", name: "07" },
] as SpaDemoProvider[];

function booking(overrides: Partial<SpaDemoBooking>): SpaDemoBooking {
  return {
    id: "booking-1",
    date: "2026-09-01",
    time: "15:30",
    customer: "彥陸",
    service: "全身精油舒壓",
    serviceItems: ["全身精油舒壓"],
    providerId: "staff-08",
    durationMinutes: 60,
    bufferMinutes: 30,
    status: "已完成",
    tone: "slate",
    remainingSessions: null,
    note: "無",
    partySize: 3,
    guestIndex: 1,
    price: 1300,
    settlementLabel: "現金",
    settlementAmount: 5000,
    ...overrides,
  };
}

describe("SPA daily operations and accounting summary", () => {
  it("counts one group checkout once instead of tripling the total", () => {
    const summary = buildSpaDailySummary([
      booking({ id: "booking-1", guestIndex: 1, price: 1300, providerId: "staff-08" }),
      booking({ id: "booking-2", guestIndex: 2, price: 1500, providerId: "staff-10" }),
      booking({ id: "booking-3", guestIndex: 3, price: 2200, providerId: "staff-07" }),
    ], providers);

    expect(summary.paidAmount).toBe(5000);
    expect(summary).toMatchObject({
      expectedAmount: 5000,
      unsettledGroupCount: 0,
      unrecordedPaymentCount: 0,
      reconciliationStatus: "READY",
    });
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0]).toMatchObject({ checkoutMode: "整組付款", paidAmount: 5000, people: 3 });
    expect(summary.payments).toContainEqual({ method: "現金", count: 1, amount: 5000 });
    expect(summary.providerPerformance.map((provider) => provider.serviceAmount)).toEqual([1300, 1500, 2200]);
  });

  it("adds separate checkout amounts and preserves mixed methods", () => {
    const summary = buildSpaDailySummary([
      booking({ id: "booking-1", guestIndex: 1, settlementAmount: 1300, settlementLabel: "現金" }),
      booking({ id: "booking-2", guestIndex: 2, price: 1500, providerId: "staff-10", settlementAmount: 1500, settlementLabel: "刷卡" }),
      booking({ id: "booking-3", guestIndex: 3, price: 2200, providerId: "staff-07", settlementAmount: 2200, settlementLabel: "現金" }),
    ], providers);

    expect(summary.paidAmount).toBe(5000);
    expect(summary.groups[0]).toMatchObject({ checkoutMode: "分開付款", paymentSummary: "現金＋刷卡" });
    expect(summary.payments).toEqual([
      { method: "現金", count: 2, amount: 3500 },
      { method: "刷卡", count: 1, amount: 1500 },
    ]);
  });

  it("keeps unfinished services out of received revenue", () => {
    const summary = buildSpaDailySummary([
      booking({ id: "booking-1", status: "已確認", tone: "sage", settlementAmount: null, settlementLabel: null }),
    ], providers);

    expect(summary).toMatchObject({
      bookingCount: 1,
      completedCount: 0,
      pendingCount: 1,
      paidAmount: 0,
      unsettledGroupCount: 1,
      reconciliationStatus: "PENDING",
    });
    expect(summary.groups[0]).toMatchObject({ checkoutMode: "待結帳", paymentSummary: "尚未結帳" });
    expect(summary.payments).toEqual([]);
  });

  it("requires a recorded payment method before daily reconciliation", () => {
    const summary = buildSpaDailySummary([
      booking({ settlementAmount: null, settlementLabel: null }),
    ], providers);

    expect(summary).toMatchObject({
      completedCount: 1,
      unrecordedPaymentCount: 1,
      reconciliationStatus: "PENDING",
    });
  });

  it("marks a day without bookings as not requiring reconciliation", () => {
    expect(buildSpaDailySummary([], providers)).toMatchObject({
      bookingCount: 0,
      expectedAmount: 0,
      paidAmount: 0,
      reconciliationStatus: "EMPTY",
    });
  });
});
