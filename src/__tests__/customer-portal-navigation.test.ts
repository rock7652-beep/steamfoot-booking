import { describe, expect, it } from "vitest";
import { getCustomerPortalNavItems } from "@/lib/customer-portal-navigation";

describe("customer portal health navigation", () => {
  it("shows the health entry only when the store feature is enabled", () => {
    expect(
      getCustomerPortalNavItems({ healthAssessmentEnabled: true }).map(
        (item) => item.href,
      ),
    ).toContain("/health");

    expect(
      getCustomerPortalNavItems({ healthAssessmentEnabled: false }).map(
        (item) => item.href,
      ),
    ).not.toContain("/health");
  });

  it("keeps the other customer navigation items unchanged", () => {
    expect(
      getCustomerPortalNavItems({ healthAssessmentEnabled: false }).map(
        (item) => item.href,
      ),
    ).toEqual(["/book", "/my-bookings", "/my-referrals", "/profile"]);
  });
});
