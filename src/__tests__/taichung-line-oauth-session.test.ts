import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Taichung LINE OAuth session bridge", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.LINE_OAUTH_STORE_CONTEXT_SECRET = "bridge-test-secret";
  });

  it("rejects a tampered or expired signed cookie", async () => {
    const { issueTaichungLineSession, verifyTaichungLineSession } = await import("@/lib/line-oauth/taichung-session");
    const raw = issueTaichungLineSession({ attemptId: "a", userId: "u", customerId: "c", storeId: "s", lineUserId: "line-user" });
    expect(verifyTaichungLineSession(`${raw}x`)).toBeNull();
    vi.useFakeTimers();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(verifyTaichungLineSession(raw)).toBeNull();
    vi.useRealTimers();
  });

  it("retains the exact customer, store, and user claims for server-side binding checks", async () => {
    const { issueTaichungLineSession, verifyTaichungLineSession } = await import("@/lib/line-oauth/taichung-session");
    const raw = issueTaichungLineSession({ attemptId: "attempt", userId: "user-taichung", customerId: "customer-taichung", storeId: "store-taichung", lineUserId: "line-user" });
    expect(verifyTaichungLineSession(raw)).toMatchObject({ userId: "user-taichung", customerId: "customer-taichung", storeId: "store-taichung", lineUserId: "line-user" });
  });
});
