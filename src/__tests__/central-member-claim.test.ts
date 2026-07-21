import { describe, expect, it } from "vitest";
import { planCentralMemberClaims } from "@/server/services/central-member-claim";

const candidate = (overrides: Record<string, unknown> = {}) => ({
  id: "customer-a",
  storeId: "store-a",
  userId: null,
  mergedIntoCustomerId: null,
  identityLinks: [],
  ...overrides,
});

describe("planCentralMemberClaims", () => {
  it("claims one unowned customer per store", () => {
    const result = planCentralMemberClaims("user-1", [
      candidate(),
      candidate({ id: "customer-b", storeId: "store-b" }),
    ], []);
    expect(result.status).toBe("claimable");
    if (result.status === "claimable") expect(result.candidates).toHaveLength(2);
  });

  it("does not rewrite an already verified membership", () => {
    expect(planCentralMemberClaims("user-1", [candidate()], [
      { storeId: "store-a", customerId: "customer-a" },
    ])).toEqual({ status: "nothing_to_claim", candidates: [] });
  });

  it("fails closed for duplicate phone rows in one store", () => {
    expect(planCentralMemberClaims("user-1", [candidate(), candidate({ id: "customer-b" })], []))
      .toEqual({ status: "conflict", reason: "multiple_customers_in_store", candidates: [] });
  });

  it("fails closed when the customer belongs to another user", () => {
    expect(planCentralMemberClaims("user-1", [candidate({ userId: "user-2" })], []))
      .toEqual({ status: "conflict", reason: "customer_owned_by_another_user", candidates: [] });
  });

  it("fails closed when any identity belongs to another user", () => {
    expect(planCentralMemberClaims("user-1", [candidate({ identityLinks: [{ userId: "user-2" }] })], []))
      .toEqual({ status: "conflict", reason: "identity_owned_by_another_user", candidates: [] });
  });

  it("fails closed when the account already points to another customer in that store", () => {
    expect(planCentralMemberClaims("user-1", [candidate()], [
      { storeId: "store-a", customerId: "other" },
    ])).toEqual({ status: "conflict", reason: "existing_membership_conflict", candidates: [] });
  });

  it("ignores merged source rows", () => {
    expect(planCentralMemberClaims("user-1", [candidate({ mergedIntoCustomerId: "target" })], []))
      .toEqual({ status: "nothing_to_claim", candidates: [] });
  });
});
