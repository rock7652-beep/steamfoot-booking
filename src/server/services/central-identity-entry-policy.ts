export type CentralIdentityEntryPoint =
  | "line"
  | "google"
  | "phone_password"
  | "staff_created";

export type CentralIdentityCandidateState =
  | "none"
  | "single_active"
  | "multiple_in_store"
  | "merged";

export type CentralIdentityOwnershipState =
  | "unowned"
  | "same_user"
  | "another_user";

export type CentralIdentityExistingLinkState =
  | "none"
  | "same_customer"
  | "different_customer";

export type CentralIdentityEntryDecision =
  | { action: "reuse_verified_link" }
  | { action: "link_existing_customer" }
  | { action: "create_store_membership" }
  | { action: "create_local_customer_only" }
  | {
      action: "manual_review";
      reason:
        | "identity_owned_by_another_user"
        | "existing_membership_conflict"
        | "multiple_customers_in_store"
        | "merged_customer";
    }
  | {
      action: "reject";
      reason: "identity_not_verified" | "phone_ownership_not_verified";
    };

export interface CentralIdentityEntryPolicyInput {
  entryPoint: CentralIdentityEntryPoint;
  /** The provider credential/password has already been verified by its provider. */
  providerIdentityVerified: boolean;
  /** Phone ownership was verified and matches the normalized candidate phone. */
  verifiedPhoneMatches: boolean;
  candidateState: CentralIdentityCandidateState;
  candidateOwnership: CentralIdentityOwnershipState;
  existingLink: CentralIdentityExistingLinkState;
}

/**
 * Pure, write-free policy shared by every customer entry point.
 *
 * It decides whether an entry is safe to converge. It never creates a User,
 * Customer, CustomerIdentityLink, booking, wallet, or transaction. PR-2 owns
 * wiring these decisions into the entry points and executing them atomically.
 */
export function decideCentralIdentityEntry(
  input: CentralIdentityEntryPolicyInput,
): CentralIdentityEntryDecision {
  if (input.entryPoint === "staff_created") {
    return { action: "create_local_customer_only" };
  }

  if (!input.providerIdentityVerified) {
    return { action: "reject", reason: "identity_not_verified" };
  }

  if (input.existingLink === "different_customer") {
    return { action: "manual_review", reason: "existing_membership_conflict" };
  }
  if (input.candidateOwnership === "another_user") {
    return { action: "manual_review", reason: "identity_owned_by_another_user" };
  }
  if (input.candidateState === "multiple_in_store") {
    return { action: "manual_review", reason: "multiple_customers_in_store" };
  }
  if (input.candidateState === "merged") {
    return { action: "manual_review", reason: "merged_customer" };
  }

  if (input.existingLink === "same_customer") {
    return { action: "reuse_verified_link" };
  }

  if (input.candidateState === "single_active") {
    if (input.candidateOwnership === "same_user") {
      return { action: "link_existing_customer" };
    }
    if (!input.verifiedPhoneMatches) {
      return { action: "reject", reason: "phone_ownership_not_verified" };
    }
    return { action: "link_existing_customer" };
  }

  return { action: "create_store_membership" };
}
