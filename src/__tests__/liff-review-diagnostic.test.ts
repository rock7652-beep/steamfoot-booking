import { describe, expect, it } from "vitest";
import { createLiffReviewDiagnostic } from "@/server/services/liff-review-diagnostic";

const input = { storeId: "isolated-store", identityProvider: "line", channelId: "isolated-channel",
  verifiedSubject: "U00000000000000000000000000000001", reason: "account_owner_conflict" as const };

describe("verified LIFF review evidence", () => {
  it("correlates retries without retaining a raw subject and gives each rejection its own reference", () => {
    const first = createLiffReviewDiagnostic(input);
    const retry = createLiffReviewDiagnostic(input);
    expect(first.verifiedIdentityFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first.verifiedIdentityFingerprint).toBe(retry.verifiedIdentityFingerprint);
    expect(first.referenceId).not.toBe(retry.referenceId);
    expect(JSON.stringify(first)).not.toContain(input.verifiedSubject);
    expect(first).toMatchObject({ reason: input.reason, identityProvider: "line", channelId: input.channelId });
  });
  it.each([
    { storeId: "another-store" },
    { identityProvider: "line-store:another-provider" },
    { verifiedSubject: "U00000000000000000000000000000002" },
  ])("does not conflate a different identity namespace: %j", change => {
    expect(createLiffReviewDiagnostic({ ...input, ...change }).verifiedIdentityFingerprint)
      .not.toBe(createLiffReviewDiagnostic(input).verifiedIdentityFingerprint);
  });
});
