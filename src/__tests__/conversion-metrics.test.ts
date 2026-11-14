import { describe, expect, it } from "vitest";
import {
  buildConversionMetrics,
  selectConversionCustomerIds,
  selectRenewalCustomerIds,
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
      trial("tracked", "2026-06-23"),
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
  it("backfills both opening people and rate to the period of the trial even across months", () => {
    const metrics = buildConversionMetrics(
      "2026-07",
      [trial("same-day", "2026-07-10"), trial("later", "2026-07-10")],
      [
        purchase("same-day", "2026-07-10T15:59:59.000Z"),
        purchase("same-day", "2026-07-10T08:00:00.000Z"),
        purchase("later", "2026-08-08T03:00:00.000Z"),
      ],
    );

    expect(metrics.trialCustomers.current).toBe(2);
    expect(metrics.convertedCustomers.current).toBe(2);
    expect(metrics.conversionRate.current).toBe(100);
    expect(metrics.unconvertedCustomers.current).toBe(0);

    const august = buildConversionMetrics(
      "2026-08",
      [trial("same-day", "2026-07-10"), trial("later", "2026-07-10")],
      [
        purchase("same-day", "2026-07-10T08:00:00.000Z"),
        purchase("later", "2026-08-08T03:00:00.000Z"),
      ],
    );
    expect(august.currentTrialConversions.current).toBe(0);
    expect(august.trackedConversions.current).toBe(1);
    expect(august.convertedCustomers.current).toBe(0);
  });

  it("uses confirmation day for the 30-day window but retains the trial period attribution", () => {
    const deferred = {
      customerId: "bank-transfer",
      transactionDate: new Date("2026-07-31T03:00:00.000Z"),
      paidAt: new Date("2026-08-02T03:00:00.000Z"),
      customerPlanWallet: { status: "ACTIVE" },
    };
    const trials = [trial("bank-transfer", "2026-07-03")];

    expect(buildConversionMetrics("2026-07", trials, [deferred]).convertedCustomers.current).toBe(1);
    const august = buildConversionMetrics("2026-08", trials, [deferred]);
    expect(august.trackedConversions.current).toBe(1);
    expect(august.convertedCustomers.current).toBe(0);
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


describe("30-day conversion and renewal boundaries", () => {
  it("includes the whole Taiwan day 30, excludes day 31 and uses confirmed payment date", () => {
    const trials = [trial("day30", "2026-10-01"), trial("day31", "2026-10-01"), trial("deferred", "2026-10-01")];
    const purchases = [purchase("day30", "2026-10-31T15:59:59.999Z"), purchase("day31", "2026-10-31T16:00:00.000Z"),
      {...purchase("deferred", "2026-10-20T04:00:00Z"), paidAt: new Date("2026-10-31T16:00:00Z")}];
    const selected = selectConversionCustomerIds("2026-10", trials, purchases);
    expect([...selected.cohortConvertedCustomerIds]).toEqual(["day30"]);
    expect(selected.convertedCustomerIds.has("day30")).toBe(true);
    expect(selected.unconvertedCustomerIds.has("day31")).toBe(false); // already bought; do not chase as a non-buyer
  });
  it("keeps custom-period opening people and rate on the same trial cohort across months", () => {
    const trials = [trial("cross", "2026-10-25")], purchases = [purchase("cross", "2026-11-04T04:00:00Z")];
    const october = selectConversionCustomerIds("2026-10", trials, purchases, {startDate:"2026-10-25",endDate:"2026-10-31"});
    expect(october.cohortConvertedCustomerIds.size).toBe(1);
    expect(october.currentTrialConvertedCustomerIds.size).toBe(0);
    expect(october.convertedCustomerIds.size).toBe(1);
    const november = selectConversionCustomerIds("2026-11", trials, purchases);
    expect(november.trackedConvertedCustomerIds.size).toBe(1);
    expect(november.trialCustomerIds.size).toBe(0);
    expect(buildConversionMetrics("2026-10", trials, purchases).conversionRate.current).toBe(100);
  });
  it("does not count a pre-existing paid member or a later trial as a new conversion", () => {
    const trials = [trial("old", "2026-10-10"), trial("repeat", "2026-09-01"), trial("repeat", "2026-10-10")];
    const purchases = [purchase("old", "2026-09-01T04:00:00Z"),purchase("old", "2026-10-11T04:00:00Z"),purchase("repeat", "2026-10-11T04:00:00Z")];
    const selection = selectConversionCustomerIds("2026-10", trials, purchases);
    expect(selection.trialCustomerIds.has("old")).toBe(false);
    expect(selection.cohortConvertedCustomerIds.size).toBe(0);
  });
  it("marks only actual non-buyers with an unfinished window as observing", () => {
    const selection = selectConversionCustomerIds("2026-10", [trial("open", "2026-10-25"),trial("expired", "2026-10-01")], [], undefined, new Date("2026-11-10T04:00:00Z"));
    expect([...selection.observingTrialCustomerIds]).toEqual(["open"]);
    expect(selection.unconvertedCustomerIds.size).toBe(2);
  });
  it("counts the reported September first purchase and November renewal only once", () => {
    const purchases = [purchase("renewing", "2026-09-17T11:36:29Z"),purchase("renewing", "2026-11-04T01:38:35Z"),purchase("renewing", "2026-11-10T01:00:00Z")];
    const metrics = buildConversionMetrics("2026-11", [trial("renewing","2026-09-17")], purchases);
    expect(metrics.convertedCustomers.current).toBe(0);
    expect(metrics.renewedCustomers.current).toBe(1);
    expect(selectRenewalCustomerIds("2026-09", purchases).size).toBe(0);
  });
  it("includes renewals without trials and excludes duplicate wallet payments, free/refunded or cancelled rights", () => {
    const first = {...purchase("direct","2026-09-01T04:00:00Z"),customerPlanWallet:{id:"first",status:"ACTIVE"}};
    const split = {...purchase("direct","2026-10-01T04:00:00Z"),customerPlanWallet:{id:"first",status:"ACTIVE"}};
    const second = {...purchase("direct","2026-10-20T04:00:00Z"),customerPlanWallet:{id:"second",status:"ACTIVE"}};
    const invalid = [purchase("direct","2026-10-02T04:00:00Z","CANCELLED"),{...purchase("direct","2026-10-03T04:00:00Z"),netAmount:0}];
    expect(selectRenewalCustomerIds("2026-10",[first,split,...invalid]).size).toBe(0);
    expect([...selectRenewalCustomerIds("2026-10",[second,first,split,...invalid])]).toEqual(["direct"]);
    expect(selectRenewalCustomerIds("2026-10",[first,second],{startDate:"2026-10-01",endDate:"2026-10-19"}).size).toBe(0);
  });
});

it("excludes day-31 or unrelated direct purchases from both trial-cohort openings and conversion rate", () => {
 const trials=[trial("late","2026-10-01")];
 const purchases=[purchase("late","2026-11-02T04:00:00Z"),purchase("direct","2026-11-03T04:00:00Z")];
 expect(buildConversionMetrics("2026-11",trials,purchases).convertedCustomers.current).toBe(0);
 expect(buildConversionMetrics("2026-10",trials,purchases).convertedCustomers.current).toBe(0);
 expect(buildConversionMetrics("2026-10",trials,purchases).conversionRate.current).toBe(0);
 expect(buildConversionMetrics("2026-11",trials,purchases).trackedConversions.current).toBe(0);
});
