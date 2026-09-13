import { describe, expect, it } from "vitest";
import { isSingleStoreTrial, isSingleStoreFeature, trialDates, trialDateState } from "@/lib/single-store-trial";
import { FEATURES, getPlanLimits, PLAN_LIMITS } from "@/lib/feature-flags";
import { computeLifecycle } from "@/lib/subscription-lifecycle";
const overrides = { maxStaffOverride: null, maxCustomersOverride: null, maxMonthlyBookingsOverride: null, maxMonthlyReportsOverride: null, maxReminderSendsOverride: null, maxStoresOverride: null };
const trial = { plan: "EXPERIENCE" as const, planStatus: "TRIAL", planEffectiveAt: new Date("2026-09-13T00:00:00Z"), planExpiresAt: new Date("2026-10-12T00:00:00Z") };
describe("explicit single-store trial policy", () => {
  it("includes opening day and the entire thirtieth day", () => {
    expect(trialDates("2026-09-13")).toEqual({ startDate: "2026-09-13", endDate: "2026-10-12" });
    expect(trialDateState(trial, "2026-10-12").expired).toBe(false);
    expect(trialDateState(trial, "2026-10-13").expired).toBe(true);
    expect(trialDateState(trial, "2026-09-12").started).toBe(false);
    expect(trialDates("2028-02-01").endDate).toBe("2028-03-01");
    expect(() => trialDates("2026-09-13", 1.5)).toThrow();
  });
  it("gives three shared people and enables report use without expanding customer or external message quotas", () => {
    expect(getPlanLimits({ ...trial, ...overrides, maxStaffOverride: 99 })).toEqual({ maxStaff: 3, maxCustomers: 100, maxMonthlyBookings: 100, maxMonthlyReports: null, maxReminderSends: 50, maxStores: 1 });
    for (const feature of [FEATURES.MEMBER_PORTAL, FEATURES.LINE_REMINDER, FEATURES.DATA_EXPORT, FEATURES.BASIC_REPORTS, FEATURES.CASH_DRAWER]) expect(isSingleStoreFeature(feature)).toBe(true);
    for (const feature of [FEATURES.MULTI_STORE, FEATURES.HEADQUARTER_VIEW, FEATURES.ALLIANCE_ANALYTICS]) expect(isSingleStoreFeature(feature)).toBe(false);
  });
  it("does not change paid stores or silently enable legacy undated stores", () => {
    expect(isSingleStoreTrial({ plan: "EXPERIENCE" })).toBe(false);
    for (const plan of ["BASIC", "GROWTH", "ALLIANCE"] as const) {
      expect(isSingleStoreTrial({ ...trial, plan })).toBe(false);
      expect(getPlanLimits({ ...trial, ...overrides, plan, planStatus: "ACTIVE" })).toEqual(PLAN_LIMITS[plan]);
    }
  });
  it("keeps trial access while an upgrade awaits payment", () => {
    expect(isSingleStoreTrial({ ...trial, planStatus: "PAYMENT_PENDING" })).toBe(true);
    expect(getPlanLimits({ ...trial, ...overrides, planStatus: "PAYMENT_PENDING" }).maxStaff).toBe(3);
  });
  it("keeps expired subscriptions expired, including those missing an end date", () => {
    expect(computeLifecycle({ status: "EXPIRED", expiresAt: null }, "2026-10-13").isExpired).toBe(true);
    expect(computeLifecycle({ status: "TRIAL", expiresAt: trial.planExpiresAt }, "2026-10-12").state).toBe("TRIAL");
    expect(computeLifecycle({ status: "TRIAL", expiresAt: trial.planExpiresAt }, "2026-10-13").state).toBe("EXPIRED");
  });
});
