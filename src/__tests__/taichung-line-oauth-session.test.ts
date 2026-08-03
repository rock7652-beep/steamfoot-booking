import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

describe("Taichung LINE OAuth session bridge", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.LINE_OAUTH_STORE_CONTEXT_SECRET = "bridge-test-secret";
  });

  it("distinguishes tampered, expired, missing, and malformed signed cookies", async () => {
    const { issueTaichungLineSession, verifyTaichungLineSession, verifyTaichungLineSessionDetailed } = await import("@/lib/line-oauth/taichung-session");
    const raw = issueTaichungLineSession({ attemptId: "a", userId: "u", customerId: "c", storeId: "s", lineUserId: "line-user" });
    expect(verifyTaichungLineSession(`${raw}x`)).toBeNull();
    expect(verifyTaichungLineSessionDetailed(undefined)).toEqual({ status: "rejected", error: "bridge_cookie_missing" });
    expect(verifyTaichungLineSessionDetailed(`${raw}x`)).toEqual({ status: "rejected", error: "bridge_signature_invalid" });
    vi.useFakeTimers();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(verifyTaichungLineSession(raw)).toBeNull();
    expect(verifyTaichungLineSessionDetailed(raw)).toEqual({ status: "rejected", error: "bridge_expired" });
    vi.useRealTimers();
  });

  it("rejects a validly signed but malformed payload without exposing the cookie", async () => {
    const { verifyTaichungLineSessionDetailed } = await import("@/lib/line-oauth/taichung-session");
    const body = Buffer.from(JSON.stringify({ attemptId: "attempt-only" })).toString("base64url");
    const signature = createHmac("sha256", "bridge-test-secret")
      .update(body)
      .digest("base64url");

    expect(verifyTaichungLineSessionDetailed(`${body}.${signature}`)).toEqual({
      status: "rejected",
      error: "bridge_payload_invalid",
    });
  });

  it("retains the exact customer, store, and user claims for server-side binding checks", async () => {
    const { issueTaichungLineSession, verifyTaichungLineSession } = await import("@/lib/line-oauth/taichung-session");
    const raw = issueTaichungLineSession({ attemptId: "attempt", userId: "user-taichung", customerId: "customer-taichung", storeId: "store-taichung", lineUserId: "line-user" });
    expect(verifyTaichungLineSession(raw)).toMatchObject({ userId: "user-taichung", customerId: "customer-taichung", storeId: "store-taichung", lineUserId: "line-user" });
  });
});
