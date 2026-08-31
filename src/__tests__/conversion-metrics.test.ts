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
  it("separates current-month and tracked openings by the actual purchase month", () => {
    const trials = [
      trial("unconverted", "2026-07-03"),
      trial("converted", "2026-07-03"),
      trial("next-day", "2026-07-03"),
      trial("tracked", "2026-06-03"),
      trial("cancelled-wallet", "2026-07-03"),
    ];
    const purchases = [
      purchase("converted", "2026-07-03T03:00:00.000Z"),
      purchase("next-day", "2026-07-04T03:00:00.000Z"),
      purchase("tracked", "2026-07-20T03:00:00.000Z"),
      purchase("cancelled-wallet", "2026-07-03T03:00:00.000Z", "CANCELLED"),
    ];
    const selection = selectConversionCustomerIds("2026-07", trials, purchases);
    const metrics = buildConversionMetrics("2026-07", trials, purchases);

    expect([...selection.unconvertedCustomerIds].sort()).toEqual([
      "cancelled-wallet",
      "unconverted",
    ]);
    expect([...selection.currentTrialConvertedCustomerIds].sort()).toEqual(["converted", "next-day"]);
    expect([...selection.trackedConvertedCustomerIds]).toEqual(["tracked"]);
    expect(metrics.currentTrialConversions.current).toBe(2);
    expect(metrics.trackedConversions.current).toBe(1);
    expect(metrics.convertedCustomers.current).toBe(selection.convertedCustomerIds.size);
  });
  it("counts a later purchase in the same month and attributes a next-month purchase to next month", () => {
    const metrics = buildConversionMetrics(
      "2026-07",
      [trial("same-day", "2026-07-10"), trial("later", "2026-07-10")],
      [
        purchase("same-day", "2026-07-10T15:59:59.000Z"),
        purchase("same-day", "2026-07-10T08:00:00.000Z"),
        purchase("later", "2026-08-31T03:00:00.000Z"),
      ],
    );

    expect(metrics.convertedCustomers.current).toBe(1);
    expect(metrics.conversionRate.current).toBe(50);
    expect(metrics.unconvertedCustomers.current).toBe(1);

    const august = buildConversionMetrics(
      "2026-08",
      [trial("same-day", "2026-07-10"), trial("later", "2026-07-10")],
      [
        purchase("same-day", "2026-07-10T08:00:00.000Z"),
        purchase("later", "2026-08-31T03:00:00.000Z"),
      ],
    );
    expect(august.currentTrialConversions.current).toBe(0);
    expect(august.trackedConversions.current).toBe(1);
    expect(august.convertedCustomers.current).toBe(1);
  });

  it("attributes a deferred payment to the month it was actually confirmed", () => {
    const deferred = {
      customerId: "bank-transfer",
      transactionDate: new Date("2026-07-31T03:00:00.000Z"),
      paidAt: new Date("2026-08-02T03:00:00.000Z"),
      customerPlanWallet: { status: "ACTIVE" },
    };
    const trials = [trial("bank-transfer", "2026-07-01")];

    expect(buildConversionMetrics("2026-07", trials, [deferred]).convertedCustomers.current).toBe(0);
    const august = buildConversionMetrics("2026-08", trials, [deferred]);
    expect(august.trackedConversions.current).toBe(1);
    expect(august.convertedCustomers.current).toBe(1);
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

  it("deduplicates opening customers while retaining every completed trial attendee", () => {
    const metrics = buildConversionMetrics(
      "2026-07",
      [trial("customer-1", "2026-07-03"), trial("customer-1", "2026-07-04")],
      [],
    );

    expect(metrics.convertedCustomers.current).toBe(0);
    expect(metrics.conversionRate.current).toBe(0);
    expect(metrics.unconvertedCustomers.current).toBe(2);
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
