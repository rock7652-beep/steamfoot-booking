import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshLiffSession } from "@/lib/liff/session-refresh";

it("retains only a safe server review reference for store assistance", async () => {
  const referenceId = "a1234567-1234-1234-1234-123456789abc";
  expect(await refreshLiffSession({ idToken: "isolated-token", storeSlug: "isolated" }, async () => ({ status: "error", code: "IDENTITY_REVIEW_REQUIRED", referenceId })))
    .toEqual({ status: "identity_review_required", referenceId });
  expect(await refreshLiffSession({ idToken: "isolated-token", storeSlug: "isolated" }, async () => ({ status: "error", code: "IDENTITY_REVIEW_REQUIRED", referenceId: "raw private value" })))
    .toEqual({ status: "identity_review_required" });
});
const input = { idToken: "current-token", storeSlug: "shop" };
afterEach(() => vi.unstubAllGlobals());
describe("shared LIFF session refresh", () => {
  it.each([null, {}, { status: "unknown" }, { status: "error", code: "NETWORK" }])("fails closed for %j", async (body) => {
    expect(await refreshLiffSession(input, async () => body)).toEqual({ status: "service_unavailable" });
  });
  it("does not call exchange without a token", async () => {
    const exchange = vi.fn();
    expect(await refreshLiffSession({ ...input, idToken: "" }, exchange)).toEqual({ status: "expired" });
    expect(exchange).not.toHaveBeenCalled();
  });
  it("does not reuse success across identity or store changes", async () => {
    const exchange = vi.fn().mockResolvedValueOnce({ status: "session_created" }).mockResolvedValueOnce({ status: "need_onboarding" });
    expect((await refreshLiffSession(input, exchange)).status).toBe("session_created");
    expect((await refreshLiffSession({ idToken: "other", storeSlug: "other" }, exchange)).status).toBe("need_onboarding");
    expect(exchange).toHaveBeenCalledTimes(2);
  });
  it("rejects HTTP errors even when the payload claims success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ status: "session_created" }) }));
    expect((await refreshLiffSession(input)).status).toBe("service_unavailable");
  });
  it("preserves expired token handling", async () => {
    expect((await refreshLiffSession(input, async () => ({ status: "error", code: "ID_TOKEN_EXPIRED" }))).status).toBe("expired");
  });
});

it("preserves identity review separately from retryable outages", async () => {
  expect(await refreshLiffSession(input, async () => ({ status: "error", code: "IDENTITY_REVIEW_REQUIRED" }))).toEqual({ status: "identity_review_required" });
});
