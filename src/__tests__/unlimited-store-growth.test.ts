import { describe, expect, it } from "vitest";
import { getPlanLimits, PLAN_LIMITS } from "@/lib/feature-flags";
import { checkReminderSendLimit } from "@/lib/reminder-send-limit";
import type { StorePlanFields } from "@/lib/store-plan";

describe("unlimited store growth", () => {
  it.each(["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"] as const)("%s ignores old HQ growth overrides and preserves branch/report entitlements", plan => {
    const store = { plan, maxStaffOverride: 1, maxCustomersOverride: 1,
      maxMonthlyBookingsOverride: 1, maxReminderSendsOverride: 1,
      maxMonthlyReportsOverride: 7, maxStoresOverride: 4 } as StorePlanFields;
    expect(getPlanLimits(store)).toMatchObject({ maxStaff: null, maxCustomers: null,
      maxMonthlyBookings: null, maxReminderSends: null, maxMonthlyReports: 7, maxStores: 4 });
    expect(checkReminderSendLimit(store, 100000)).toEqual({ allowed: true, current: 100000, limit: null });
    expect(PLAN_LIMITS[plan]).toMatchObject({ maxStaff: null, maxCustomers: null,
      maxMonthlyBookings: null, maxReminderSends: null });
  });
});
