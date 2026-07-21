import { describe, expect, it } from "vitest";
import {
  planCentralMemberClaims,
  verifyLinePhoneClaimEvidence,
} from "@/server/services/central-member-claim";

const candidate = (overrides: Record<string, unknown> = {}) => ({
  id: "customer-a",
  storeId: "store-a",
  userId: null,
  mergedIntoCustomerId: null,
  identityLinks: [],
  ...overrides,
});

describe("verifyLinePhoneClaimEvidence", () => {
  const validEvidence = {
    enteredPhone: "0912-345-678",
    userPhone: "0912345678",
    currentCustomerPhone: "+886912345678",
    hasLineAccount: true,
    currentMembershipBelongsToUser: true,
  };

  it("accepts LINE identity plus the same normalized phone on the current membership", () => {
    expect(verifyLinePhoneClaimEvidence(validEvidence)).toBeNull();
  });

  it("does not require a password but rejects accounts without LINE identity", () => {
    expect(verifyLinePhoneClaimEvidence({ ...validEvidence, hasLineAccount: false }))
      .toBe("line_identity_required");
  });

  it("rejects a phone that does not match both central and current-store records", () => {
    expect(verifyLinePhoneClaimEvidence({ ...validEvidence, enteredPhone: "0987654321" }))
      .toBe("phone_mismatch");
    expect(verifyLinePhoneClaimEvidence({ ...validEvidence, currentCustomerPhone: "0987654321" }))
      .toBe("phone_mismatch");
  });

  it("rejects an unlinked current-store customer", () => {
    expect(verifyLinePhoneClaimEvidence({
      ...validEvidence,
      currentMembershipBelongsToUser: false,
    })).toBe("current_membership_unverified");
  });
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
