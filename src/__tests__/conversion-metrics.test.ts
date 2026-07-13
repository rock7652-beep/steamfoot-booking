import { describe, expect, it } from "vitest";
import {
  buildConversionMetrics,
  selectConversionCustomerIds,
} from "@/server/queries/conversion-metrics";

const trial = (customerId: string, date: string) => ({
  customerId,
  bookingDate: new Date(`${date}T00:00:00.000Z`),
});

const purchase = (
  customerId: string,
  timestamp: string,
  walletStatus = "ACTIVE",
) => ({
  customerId,
  transactionDate: new Date(timestamp),
  customerPlanWallet: { status: walletStatus },
});

describe("buildConversionMetrics", () => {
  it("uses one selection for KPI counts and the unconverted customer list", () => {
    const trials = [
      trial("unconverted", "2026-07-03"),
      trial("unconverted", "2026-07-04"),
      trial("converted", "2026-07-03"),
      trial("next-day", "2026-07-03"),
      trial("cancelled-wallet", "2026-07-03"),
    ];
    const purchases = [
      purchase("converted", "2026-07-03T03:00:00.000Z"),
      purchase("converted", "2026-07-03T04:00:00.000Z"),
      purchase("next-day", "2026-07-04T03:00:00.000Z"),
      purchase("cancelled-wallet", "2026-07-03T03:00:00.000Z", "CANCELLED"),
    ];
    const selection = selectConversionCustomerIds("2026-07", trials, purchases);
    const metrics = buildConversionMetrics("2026-07", trials, purchases);

    expect([...selection.unconvertedCustomerIds].sort()).toEqual([
      "cancelled-wallet",
      "next-day",
      "unconverted",
    ]);
    expect(metrics.unconvertedCustomers.current).toBe(selection.unconvertedCustomerIds.size);
  });
  it("counts a same-Taipei-day purchase once and excludes a later purchase", () => {
    const metrics = buildConversionMetrics(
      "2026-07",
      [trial("same-day", "2026-07-10"), trial("later", "2026-07-10")],
      [
        purchase("same-day", "2026-07-10T15:59:59.000Z"),
        purchase("same-day", "2026-07-10T08:00:00.000Z"),
        purchase("later", "2026-07-10T16:00:00.000Z"),
      ],
    );

    expect(metrics.convertedCustomers.current).toBe(1);
    expect(metrics.conversionRate.current).toBe(50);
    expect(metrics.unconvertedCustomers.current).toBe(1);
  });

  it("excludes cancelled or missing wallet rights but retains partially refunded rights", () => {
    const metrics = buildConversionMetrics(
      "2026-07",
      [trial("cancelled", "2026-07-03"), trial("partial", "2026-07-03"), trial("missing", "2026-07-03")],
      [
        purchase("cancelled", "2026-07-03T03:00:00.000Z", "CANCELLED"),
        purchase("partial", "2026-07-03T03:00:00.000Z", "ACTIVE"),
        {
          customerId: "missing",
          transactionDate: new Date("2026-07-03T03:00:00.000Z"),
          customerPlanWallet: null,
        },
      ],
    );

    expect(metrics.convertedCustomers.current).toBe(1);
    expect(metrics.unconvertedCustomers.current).toBe(2);
  });

  it("deduplicates trials and does not use a booking people count", () => {
    const metrics = buildConversionMetrics(
      "2026-07",
      [trial("customer-1", "2026-07-03"), trial("customer-1", "2026-07-04")],
      [],
    );

    expect(metrics.convertedCustomers.current).toBe(0);
    expect(metrics.conversionRate.current).toBe(0);
    expect(metrics.unconvertedCustomers.current).toBe(1);
  });

  it("calculates MoM and YoY and handles zero baselines", () => {
    const metrics = buildConversionMetrics(
      "2026-07",
      [
        trial("current-1", "2026-07-01"),
        trial("current-2", "2026-07-02"),
        trial("previous", "2026-06-01"),
        trial("last-year", "2025-07-01"),
      ],
      [
        purchase("current-1", "2026-07-01T02:00:00.000Z"),
        purchase("previous", "2026-06-01T02:00:00.000Z"),
      ],
    );

    expect(metrics.convertedCustomers.mom).toEqual({ difference: 0, percentage: 0 });
    expect(metrics.convertedCustomers.yoy).toEqual({ difference: 1, percentage: null });
    expect(metrics.conversionRate.current).toBe(50);
    expect(metrics.conversionRate.mom).toEqual({ difference: -50, percentage: -50 });
    expect(metrics.conversionRate.yoy).toEqual({ difference: 50, percentage: null });
  });
});
