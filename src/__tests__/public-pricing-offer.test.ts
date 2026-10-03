import { describe, expect, it } from "vitest";
import { getPublicAnnualSavings, getPublicOfferHighlights, getPublicAddonOffer, DOUBLE_TEN_OFFER_END, getPublicPricingOffer, PUBLIC_PRICING_PLANS, YEAR_END_OFFER_END } from "@/lib/public-pricing-offer";

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

describe("homepage savings highlights", () => {
  it("uses the same annual savings as the plan cards without counting gifted months", () => {
    expect(PUBLIC_PRICING_PLANS.map(getPublicAnnualSavings)).toEqual([7320, 13320, 25320]);
    expect(getPublicOfferHighlights(Date.parse("2026-10-03T12:00:00+08:00"))).toEqual({annualSavings: 25320, addonSavings: 3600, bonusMonths: 2});
  });
  it("removes only the October addon discount at its cutoff", () => {
    expect(getPublicOfferHighlights(DOUBLE_TEN_OFFER_END - 1).addonSavings).toBe(3600);
    expect(getPublicOfferHighlights(DOUBLE_TEN_OFFER_END)).toEqual({annualSavings: 25320, addonSavings: 0, bonusMonths: 2});
  });
  it("removes gifted months at year end and keeps the unchanged annual plan savings", () => {
    expect(getPublicOfferHighlights(YEAR_END_OFFER_END - 1).bonusMonths).toBe(2);
    expect(getPublicOfferHighlights(YEAR_END_OFFER_END)).toEqual({annualSavings: 25320, addonSavings: 0, bonusMonths: 0});
  });
});
