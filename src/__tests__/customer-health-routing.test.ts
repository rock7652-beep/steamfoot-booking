import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customerPage = readFileSync(
  "src/app/(dashboard)/dashboard/customers/[id]/page.tsx",
  "utf8",
);
const customerHealthPage = readFileSync(
  "src/app/(dashboard)/dashboard/customers/[id]/health/page.tsx",
  "utf8",
);
const customerOwnedHealthPage = readFileSync(
  "src/app/(customer)/health/page.tsx",
  "utf8",
);
const nativeHealthService = readFileSync(
  "src/lib/native-health-service.ts",
  "utf8",
);
const grantService = readFileSync(
  "src/server/services/customer-health-history-grant.ts",
  "utf8",
);
const storeHealthOverview = readFileSync(
  "src/app/(dashboard)/dashboard/health/page.tsx",
  "utf8",
);

describe("customer health route and performance contract", () => {
  it("keeps the basic customer page on a latest-record-only query", () => {
    expect(customerPage).toContain("getLatestNativeHealthRecord");
    expect(customerPage).not.toContain("getNativeHealthSummary");
    expect(customerPage).toContain("CustomerHealthOverviewCard");
    expect(nativeHealthService).toContain("select: healthRecordSelect");
  });

  it("loads full history only on the protected customer health route", () => {
    expect(customerHealthPage).toContain('checkPermission(user.role, user.staffId, "customer.read")');
    expect(customerHealthPage).toContain("getActiveStoreForRead");
    expect(customerHealthPage).toContain("FEATURES.AI_HEALTH_SUMMARY");
    expect(customerHealthPage).toContain("mergedIntoCustomerId: null");
    expect(customerHealthPage).toContain("getStaffVisibleHealthSummary");
    expect(customerHealthPage).toContain("HealthAssessmentCard");
  });

  it("unifies only the signed-in customer's verified cross-store memberships", () => {
    expect(customerOwnedHealthPage).toContain("resolveCentralMembershipsForUser(user.id)");
    expect(customerOwnedHealthPage).toContain("getNativeHealthSummaryForMemberships");
    expect(customerOwnedHealthPage).not.toContain("phone");
    expect(nativeHealthService).toContain(
      "OR: scopes.map(({ storeId, customerId }) => ({ storeId, customerId }))",
    );
    // Staff detail only expands after an active consent row and a fresh,
    // fail-closed central membership resolution.
    expect(grantService).toContain("revokedAt: null");
    expect(grantService).toContain("resolveCentralUserForStoreCustomer");
    expect(grantService).toContain("resolveCentralMembershipsForUser");
    expect(grantService).toContain("targetStillVerified");
    // Consent never changes the store-wide overview query.
    expect(storeHealthOverview).not.toContain("CustomerHealthHistoryGrant");
    expect(storeHealthOverview).not.toContain("getStaffVisibleHealthSummary");
  });
});
