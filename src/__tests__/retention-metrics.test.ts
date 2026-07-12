import { describe, expect, it } from "vitest";
import { buildRetentionMetrics } from "@/server/queries/retention-metrics";

const completed = (customerId: string, date: string) => ({
  customerId,
  bookingDate: new Date(`${date}T00:00:00.000Z`),
});

describe("buildRetentionMetrics", () => {
  it("counts only prior-month cohort customers who return in the target month", () => {
    const metrics = buildRetentionMetrics("2026-07", [
      completed("returned", "2026-06-03"),
      completed("returned", "2026-06-18"),
      completed("returned", "2026-07-08"),
      completed("not-returned", "2026-06-12"),
      completed("new-this-month", "2026-07-04"),
    ]);

    expect(metrics.returnedCustomers.current).toBe(1);
    expect(metrics.retentionRate.current).toBe(50);
    expect(metrics.unreturnedCustomers.current).toBe(1);
  });

  it("deduplicates multiple completed bookings for the same customer", () => {
    const metrics = buildRetentionMetrics("2026-07", [
      completed("same", "2026-06-01"),
      completed("same", "2026-06-15"),
      completed("same", "2026-07-01"),
      completed("same", "2026-07-20"),
    ]);

    expect(metrics.returnedCustomers.current).toBe(1);
    expect(metrics.retentionRate.current).toBe(100);
    expect(metrics.unreturnedCustomers.current).toBe(0);
  });

  it("compares equivalent month-over-month and year-over-year cohorts", () => {
    const metrics = buildRetentionMetrics("2026-07", [
      completed("current-return", "2026-06-01"),
      completed("current-return", "2026-07-01"),
      completed("current-miss", "2026-06-02"),
      completed("mom-return-1", "2026-05-01"),
      completed("mom-return-1", "2026-06-03"),
      completed("mom-return-2", "2026-05-02"),
      completed("mom-return-2", "2026-06-04"),
      completed("yoy-miss", "2025-06-01"),
    ]);

    expect(metrics.returnedCustomers.current).toBe(1);
    expect(metrics.returnedCustomers.mom).toEqual({ difference: -1, percentage: -50 });
    expect(metrics.returnedCustomers.yoy).toEqual({ difference: 1, percentage: null });
    // 前一期回流者在 6 月完成服務，因此也自然屬於本期的 6 月 cohort。
    expect(metrics.retentionRate.current).toBe(25);
    expect(metrics.retentionRate.mom).toEqual({ difference: -75, percentage: -75 });
    expect(metrics.retentionRate.yoy).toEqual({ difference: 25, percentage: null });
  });

  it("returns a safe zero value and non-comparable result for zero cohorts", () => {
    const metrics = buildRetentionMetrics("2026-07", []);

    expect(metrics.returnedCustomers.current).toBe(0);
    expect(metrics.retentionRate.current).toBe(0);
    expect(metrics.unreturnedCustomers.current).toBe(0);
    expect(metrics.returnedCustomers.mom.percentage).toBeNull();
    expect(metrics.retentionRate.yoy.percentage).toBeNull();
  });
});
