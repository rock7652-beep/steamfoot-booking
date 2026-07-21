import { describe, expect, it } from "vitest";
import {
  decideCentralIdentityEntry,
  type CentralIdentityEntryPoint,
  type CentralIdentityEntryPolicyInput,
} from "@/server/services/central-identity-entry-policy";

const entryPoints: CentralIdentityEntryPoint[] = [
  "line",
  "google",
  "phone_password",
];

const base = (overrides: Partial<CentralIdentityEntryPolicyInput> = {}) => ({
  entryPoint: "line" as const,
  providerIdentityVerified: true,
  verifiedPhoneMatches: true,
  candidateState: "single_active" as const,
  candidateOwnership: "unowned" as const,
  existingLink: "none" as const,
  ...overrides,
});

describe("decideCentralIdentityEntry", () => {
  it.each(entryPoints)("allows %s to link one unowned customer only with verified evidence", (entryPoint) => {
    expect(decideCentralIdentityEntry(base({ entryPoint }))).toEqual({
      action: "link_existing_customer",
    });
    expect(decideCentralIdentityEntry(base({ entryPoint, verifiedPhoneMatches: false })))
      .toEqual({ action: "reject", reason: "phone_ownership_not_verified" });
  });

  it.each(entryPoints)("reuses an existing verified %s link without phone fallback", (entryPoint) => {
    expect(decideCentralIdentityEntry(base({
      entryPoint,
      verifiedPhoneMatches: false,
      existingLink: "same_customer",
    }))).toEqual({ action: "reuse_verified_link" });
  });

  it.each(entryPoints)("can create a new store membership for an authenticated %s central user", (entryPoint) => {
    expect(decideCentralIdentityEntry(base({
      entryPoint,
      verifiedPhoneMatches: false,
      candidateState: "none",
    }))).toEqual({ action: "create_store_membership" });
  });

  it("keeps staff-created customers local until the customer verifies an identity", () => {
    expect(decideCentralIdentityEntry(base({
      entryPoint: "staff_created",
      providerIdentityVerified: false,
    }))).toEqual({ action: "create_local_customer_only" });
  });

  it("rejects an unverified provider identity", () => {
    expect(decideCentralIdentityEntry(base({ providerIdentityVerified: false })))
      .toEqual({ action: "reject", reason: "identity_not_verified" });
  });

  it("routes every ownership or data-shape conflict to manual review", () => {
    expect(decideCentralIdentityEntry(base({ candidateOwnership: "another_user" })))
      .toEqual({ action: "manual_review", reason: "identity_owned_by_another_user" });
    expect(decideCentralIdentityEntry(base({ existingLink: "different_customer" })))
      .toEqual({ action: "manual_review", reason: "existing_membership_conflict" });
    expect(decideCentralIdentityEntry(base({ candidateState: "multiple_in_store" })))
      .toEqual({ action: "manual_review", reason: "multiple_customers_in_store" });
    expect(decideCentralIdentityEntry(base({ candidateState: "merged" })))
      .toEqual({ action: "manual_review", reason: "merged_customer" });
  });

  it("does not require phone re-verification when the candidate already belongs to the same user", () => {
    expect(decideCentralIdentityEntry(base({
      verifiedPhoneMatches: false,
      candidateOwnership: "same_user",
    }))).toEqual({ action: "link_existing_customer" });
  });
});
