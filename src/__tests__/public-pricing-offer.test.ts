import { describe, expect, it } from "vitest";
import { getPublicAddonOffer, DOUBLE_TEN_OFFER_END, getPublicPricingOffer, PUBLIC_PRICING_PLANS, YEAR_END_OFFER_END } from "@/lib/public-pricing-offer";

describe("public year-end payment offer", () => {
  it("ends at Taiwan midnight, with no grace period or negative countdown", () => {
    expect(getPublicPricingOffer(Date.parse("2026-12-31T23:59:59+08:00"))).toEqual({ active: true, months: 14, countdown: [0, 0, 0, 1] });
    expect(getPublicPricingOffer(YEAR_END_OFFER_END)).toEqual({ active: false, months: 12, countdown: [0, 0, 0, 0] });
    expect(getPublicPricingOffer(YEAR_END_OFFER_END + 86400000).countdown).toEqual([0, 0, 0, 0]);
  });
  it("keeps annual charges unchanged while reverting averages from 14 to 12 months", () => {
    const averages = (time: number) => PUBLIC_PRICING_PLANS.map(plan => Math.round(plan.annual / getPublicPricingOffer(time).months));
    expect(averages(YEAR_END_OFFER_END - 1)).toEqual([1277, 2134, 4277]);
    expect(averages(YEAR_END_OFFER_END)).toEqual([1490, 2490, 4990]);
  });
  it("counts actual elapsed time even after returning from a background tab", () => {
    expect(getPublicPricingOffer(YEAR_END_OFFER_END - 90061000).countdown).toEqual([1, 1, 1, 1]);
    expect(getPublicPricingOffer(YEAR_END_OFFER_END - 60000).countdown).toEqual([0, 0, 1, 0]);
  });
});

describe("Double Ten addon offer", () => {
  it("discounts only during October in Taiwan", () => {
    expect(getPublicAddonOffer(Date.parse("2026-09-30T23:59:59+08:00")).active).toBe(false);
    expect(getPublicAddonOffer(Date.parse("2026-10-01T00:00:00+08:00")).toolMonthly).toBe(300);
    expect(getPublicAddonOffer(DOUBLE_TEN_OFFER_END - 1000)).toMatchObject({active: true, toolMonthly: 300, businessMonthly: 500, months: 14, countdown: [0,0,0,1]});
    expect(getPublicAddonOffer(DOUBLE_TEN_OFFER_END)).toMatchObject({active: false, toolMonthly: 500, businessMonthly: 800, months: 14, countdown: [0,0,0,0]});
    expect(getPublicAddonOffer(YEAR_END_OFFER_END).months).toBe(12);
  });
});
