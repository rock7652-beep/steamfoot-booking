export type LineIdentityReviewReason =
  | "account_owner_conflict"
  | "store_membership_unconfirmed"
  | "ambiguous_legacy_identity"
  | "customer_owner_conflict"
  | "store_membership_conflict"
  | "account_unavailable";

/** Expected identity problems are not retryable infrastructure failures. */
export class LineIdentityReviewError extends Error {
  constructor(public readonly reason: LineIdentityReviewReason) {
    super(reason);
    this.name = "LineIdentityReviewError";
  }
}
