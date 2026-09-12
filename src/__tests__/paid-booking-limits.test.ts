import { describe, expect, it } from "vitest";
import { getPlanLimits, PLAN_LIMITS } from "@/lib/feature-flags";

describe("feature-based paid subscriptions", () => {
  const overrides = { maxStaffOverride: null, maxCustomersOverride: null, maxMonthlyBookingsOverride: 500, maxMonthlyReportsOverride: null, maxReminderSendsOverride: null, maxStoresOverride: null };
  it.each(["BASIC", "GROWTH", "ALLIANCE"] as const)("%s has no booking cap, including old overrides", plan => {
    expect(PLAN_LIMITS[plan].maxMonthlyBookings).toBeNull();
    const limits = getPlanLimits({ plan, ...overrides });
    expect(limits.maxMonthlyBookings).toBeNull();
    expect(limits.maxStaff).toBe(PLAN_LIMITS[plan].maxStaff);
    expect(limits.maxCustomers).toBe(PLAN_LIMITS[plan].maxCustomers);
    expect(limits.maxReminderSends).toBe(PLAN_LIMITS[plan].maxReminderSends);
  });
  it("preserves trial caps and trial overrides", () => {
    expect(getPlanLimits({ plan: "EXPERIENCE", ...overrides, maxMonthlyBookingsOverride: null }).maxMonthlyBookings).toBe(100);
    expect(getPlanLimits({ plan: "EXPERIENCE", ...overrides, maxMonthlyBookingsOverride: 20 }).maxMonthlyBookings).toBe(20);
  });
});
