import { createHash, randomUUID } from "node:crypto";
import type { LineIdentityReviewReason } from "./line-identity-review";

/** Only call after token and store/channel verification. This is diagnostic
 * evidence, never permission to create or move a member relationship.
 * Namespace the fingerprint by store and provider to avoid cross-store joins.
 * Never accept or persist tokens, phone numbers, or display names here.
 */
export function createLiffReviewDiagnostic(input: {
  storeId: string;
  identityProvider: string;
  channelId: string;
  verifiedSubject: string;
  reason: LineIdentityReviewReason;
}) {
  return {
    referenceId: randomUUID(),
    identityProvider: input.identityProvider,
    channelId: input.channelId,
    reason: input.reason,
    verifiedIdentityFingerprint: createHash("sha256")
      .update(JSON.stringify([input.storeId, input.identityProvider, input.verifiedSubject]))
      .digest("hex"),
  };
}
