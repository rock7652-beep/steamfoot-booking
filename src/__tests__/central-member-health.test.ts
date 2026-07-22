import { describe, expect, it } from "vitest";
import {
  detectCentralMemberHealthIssues,
  type CentralMemberHealthCustomer,
  type CentralMemberHealthLink,
} from "@/server/services/central-member-health";

function customer(overrides: Partial<CentralMemberHealthCustomer> = {}): CentralMemberHealthCustomer {
  return {
    id: "customer-1",
    storeId: "store-1",
    name: "測試顧客",
    phone: "0912345678",
    userId: "user-1",
    googleId: null,
    lineUserId: "line-1",
    mergedIntoCustomerId: null,
    ...overrides,
  };
}

function link(overrides: Partial<CentralMemberHealthLink> = {}): CentralMemberHealthLink {
  return {
    id: "link-1",
    storeId: "store-1",
    customerId: "customer-1",
    userId: "user-1",
    provider: "line",
    providerAccountId: "line-1",
    lineUserId: "line-1",
    ...overrides,
  };
}

describe("detectCentralMemberHealthIssues", () => {
  it("returns no issue for a consistent verified membership", () => {
    expect(detectCentralMemberHealthIssues("store-1", [customer()], [link()])).toEqual([]);
  });

  it("detects normalized duplicate phones only inside the active store", () => {
    const issues = detectCentralMemberHealthIssues("store-1", [
      customer(),
      customer({ id: "customer-2", userId: null, phone: "+886 912-345-678" }),
      customer({ id: "customer-3", storeId: "store-2" }),
    ], []);
    expect(issues).toMatchObject([{
      category: "PHONE",
      severity: "REVIEW",
      reason: "duplicate_phone",
      customerIds: ["customer-1", "customer-2"],
    }]);
  });

  it("blocks mismatched LINE and Google identities without suggesting a merge", () => {
    const issues = detectCentralMemberHealthIssues("store-1", [
      customer(),
      customer({ id: "customer-2", userId: "user-2", phone: "0987654321", googleId: "google-customer", lineUserId: null }),
    ], [
      link({ providerAccountId: "other-line", lineUserId: "other-line" }),
      link({ id: "link-2", customerId: "customer-2", userId: "user-2", provider: "google", providerAccountId: "other-google", lineUserId: null }),
    ]);
    expect(issues.map((issue) => issue.reason)).toEqual([
      "google_identity_mismatch",
      "line_identity_mismatch",
    ]);
    expect(issues.every((issue) => issue.severity === "BLOCKED")).toBe(true);
  });

  it("detects store drift, merged sources, conflicting users, and multiple customers", () => {
    const issues = detectCentralMemberHealthIssues("store-1", [
      customer({ userId: "another-user" }),
      customer({ id: "customer-2", mergedIntoCustomerId: "target", lineUserId: null }),
      customer({ id: "customer-3", storeId: "store-2", lineUserId: null }),
    ], [
      link(),
      link({ id: "link-2", customerId: "customer-2" }),
      link({ id: "link-3", customerId: "customer-3" }),
    ]);
    expect(new Set(issues.map((issue) => issue.reason))).toEqual(new Set([
      "customer_linked_to_another_user",
      "merged_customer",
      "link_store_mismatch",
      "multiple_customers_in_store",
    ]));
  });
});
