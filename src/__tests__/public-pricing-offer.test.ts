import { describe, expect, it } from "vitest";
import { getPublicOfferHighlights, getPublicAddonOffer, DOUBLE_TEN_OFFER_END, getPublicPricingOffer, PUBLIC_PRICING_PLANS, YEAR_END_OFFER_END } from "@/lib/public-pricing-offer";

describe("public year-end payment offer", () => {
  it("ends at Taiwan midnight, with no grace period or negative countdown", () => {
    expect(getPublicPricingOffer(Date.parse("2026-12-31T23:59:59+08:00"))).toEqual({ active: true, months: 14, countdown: [0, 0, 0, 1] });
    expect(getPublicPricingOffer(YEAR_END_OFFER_END)).toEqual({ active: false, months: 12, countdown: [0, 0, 0, 0] });
    expect(getPublicPricingOffer(YEAR_END_OFFER_END + 86400000).countdown).toEqual([0, 0, 0, 0]);
  });
  it("keeps monthly prices distinct from the 2 gifted months on annual plans", () => {
    expect(PUBLIC_PRICING_PLANS.map(plan => plan.monthly)).toEqual([1490, 2490, 2980]);
    expect(PUBLIC_PRICING_PLANS.map(plan => plan.annual)).toEqual(PUBLIC_PRICING_PLANS.map(plan => plan.monthly * 12));
    expect(getPublicPricingOffer(YEAR_END_OFFER_END - 1).months).toBe(14);
    expect(getPublicPricingOffer(YEAR_END_OFFER_END).months).toBe(12);
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
  it("shows addon savings and annual bonus months without claiming a main-plan discount", () => {
    expect(getPublicOfferHighlights(Date.parse("2026-10-03T12:00:00+08:00"))).toEqual({addonSavings: 3600, bonusMonths: 2});
  });
  it("removes only the October addon discount at its cutoff", () => {
    expect(getPublicOfferHighlights(DOUBLE_TEN_OFFER_END - 1).addonSavings).toBe(3600);
    expect(getPublicOfferHighlights(DOUBLE_TEN_OFFER_END)).toEqual({addonSavings: 0, bonusMonths: 2});
  });
  it("removes gifted months at year end while leaving annual prices unchanged", () => {
    expect(getPublicOfferHighlights(YEAR_END_OFFER_END - 1).bonusMonths).toBe(2);
    expect(getPublicOfferHighlights(YEAR_END_OFFER_END)).toEqual({addonSavings: 0, bonusMonths: 0});
  });
});
