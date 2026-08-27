/**
 * submitOnboarding server action (PR-C2) 行為測試
 *
 * 涵蓋 plan §3.2 / §3.3 列的 status mapping：
 *   - helper success 三種 → ok
 *   - helper rejection 三種 → bound_other / phone_taken_by_login_account / ambiguous
 *   - helper validation_error.invalid_phone → invalid_phone
 *   - verify EXPIRED → expired
 *   - verify NETWORK / 其他 → service_unavailable
 *   - resolveStoreBySlug null → service_unavailable
 *   - 環境變數 / input shape edge cases → service_unavailable
 *
 * Mock 範圍：
 *   - @/lib/liff/verify-id-token (verifyLiffIdToken + LiffIdTokenError class)
 *   - @/lib/store-resolver (resolveStoreBySlug)
 *   - @/server/services/bind-line-to-customer (bindLineToCustomerInStore)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── mocks (必須在 import action 之前) ──
const mockVerify = vi.fn();
const mockResolveStoreBySlug = vi.fn();
const mockBindLine = vi.fn();

vi.mock("@/lib/liff/verify-id-token", async () => {
  // 保留真正的 LiffIdTokenError class，讓 action 用 instanceof 判型
  const actual = await vi.importActual<typeof import("@/lib/liff/verify-id-token")>(
    "@/lib/liff/verify-id-token"
  );
  return {
    ...actual,
    verifyLiffIdToken: (...args: unknown[]) => mockVerify(...args),
  };
});

vi.mock("@/lib/store-resolver", () => ({
  resolveStoreBySlug: (...args: unknown[]) => mockResolveStoreBySlug(...args),
}));

vi.mock("@/server/services/bind-line-to-customer", () => ({
  bindLineToCustomerInStore: (...args: unknown[]) => mockBindLine(...args),
}));

vi.mock("@/server/services/customer-identity-link", () => ({
  upsertCustomerIdentityLink: vi.fn(),
}));

import { submitOnboarding } from "@/app/(liff)/liff/onboarding/actions";
import { LiffIdTokenError } from "@/lib/liff/verify-id-token";

const CHANNEL = "channel-123";
const STORE = { id: "store-zhubei", slug: "zhubei", name: "暖暖蒸足" };
const LINE_USER_ID = "U_line_user_abc";
const VALID_INPUT = {
  idToken: "valid.jwt.string",
  storeSlug: "zhubei",
  name: "王小明",
  phone: "0912345678",
};

function verifiedOk(overrides: { displayName?: string | null } = {}) {
  return {
    lineUserId: LINE_USER_ID,
    channelId: CHANNEL,
    displayName: overrides.displayName ?? "LINE 暱稱",
    pictureUrl: null,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
}

describe("submitOnboarding action (PR-C2)", () => {
  beforeEach(() => {
    vi.stubEnv("CENTRAL_MEMBER_LINE_LOGIN_CHANNEL_ID", CHANNEL);
    mockVerify.mockReset();
    mockResolveStoreBySlug.mockReset();
    mockBindLine.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ────────────────────────────────────────────────────────
  // Helper success → ok
  // ────────────────────────────────────────────────────────

  describe("helper success → ok", () => {
    it("created_new → ok", async () => {
      mockVerify.mockResolvedValueOnce(verifiedOk());
      mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
      mockBindLine.mockResolvedValueOnce({
        status: "created_new",
        customerId: "cust-new",
        userId: "user-new",
        lineAccountSync: "created",
      });
      const r = await submitOnboarding(VALID_INPUT);
      expect(r).toEqual({ status: "ok" });
    });

    it("bound_existing → ok", async () => {
      mockVerify.mockResolvedValueOnce(verifiedOk());
      mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
      mockBindLine.mockResolvedValueOnce({
        status: "bound_existing",
        customerId: "cust-staff",
        userId: "user-new",
        userCreated: true,
        lineAccountSync: "created",
      });
      const r = await submitOnboarding(VALID_INPUT);
      expect(r).toEqual({ status: "ok" });
    });

    it("already_synced → ok", async () => {
      mockVerify.mockResolvedValueOnce(verifiedOk());
      mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
      mockBindLine.mockResolvedValueOnce({
        status: "already_synced",
        customerId: "cust-existing",
        userId: "user-existing",
      });
      const r = await submitOnboarding(VALID_INPUT);
      expect(r).toEqual({ status: "ok" });
    });
  });

  // ────────────────────────────────────────────────────────
  // Helper validation_error → invalid_phone / service_unavailable
  // ────────────────────────────────────────────────────────

  it("helper validation_error.invalid_phone → invalid_phone", async () => {
    mockVerify.mockResolvedValueOnce(verifiedOk());
    mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
    mockBindLine.mockResolvedValueOnce({
      status: "validation_error",
      reason: "invalid_phone",
    });
    const r = await submitOnboarding(VALID_INPUT);
    expect(r).toEqual({ status: "invalid_phone" });
  });

  it("helper validation_error.missing_input → service_unavailable (caller bug)", async () => {
    mockVerify.mockResolvedValueOnce(verifiedOk());
    mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
    mockBindLine.mockResolvedValueOnce({
      status: "validation_error",
      reason: "missing_input",
    });
    const r = await submitOnboarding(VALID_INPUT);
    expect(r).toEqual({ status: "service_unavailable" });
  });

  // ────────────────────────────────────────────────────────
  // Helper rejection → 顧客面 status
  // ────────────────────────────────────────────────────────

  it("already_bound_to_other_line → bound_other", async () => {
    mockVerify.mockResolvedValueOnce(verifiedOk());
    mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
    mockBindLine.mockResolvedValueOnce({
      status: "already_bound_to_other_line",
      customerId: "cust-y",
      existingLineUserId: "U_other_line",
    });
    const r = await submitOnboarding(VALID_INPUT);
    expect(r).toEqual({ status: "bound_other" });
  });

  it("phone_taken_by_other_user → phone_taken_by_login_account", async () => {
    mockVerify.mockResolvedValueOnce(verifiedOk());
    mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
    mockBindLine.mockResolvedValueOnce({
      status: "phone_taken_by_other_user",
      customerId: "cust-z",
      sameLineUserId: false,
    });
    const r = await submitOnboarding(VALID_INPUT);
    expect(r).toEqual({ status: "phone_taken_by_login_account" });
  });

  it("ambiguous_multiple_candidates → ambiguous", async () => {
    mockVerify.mockResolvedValueOnce(verifiedOk());
    mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
    mockBindLine.mockResolvedValueOnce({
      status: "ambiguous_multiple_candidates",
      candidateIds: ["a", "b"],
    });
    const r = await submitOnboarding(VALID_INPUT);
    expect(r).toEqual({ status: "ambiguous" });
  });

  // ────────────────────────────────────────────────────────
  // Verify errors
  // ────────────────────────────────────────────────────────

  it("verify EXPIRED → expired", async () => {
    mockVerify.mockRejectedValueOnce(
      new LiffIdTokenError("EXPIRED", "idToken expired")
    );
    const r = await submitOnboarding(VALID_INPUT);
    expect(r).toEqual({ status: "expired" });
    // 不該繼續走到 helper
    expect(mockResolveStoreBySlug).not.toHaveBeenCalled();
    expect(mockBindLine).not.toHaveBeenCalled();
  });

  it("verify NETWORK → service_unavailable", async () => {
    mockVerify.mockRejectedValueOnce(
      new LiffIdTokenError("NETWORK", "ENOTFOUND")
    );
    const r = await submitOnboarding(VALID_INPUT);
    expect(r).toEqual({ status: "service_unavailable" });
    expect(mockBindLine).not.toHaveBeenCalled();
  });

  it("verify AUD_MISMATCH → service_unavailable (顧客面不細分)", async () => {
    mockVerify.mockRejectedValueOnce(
      new LiffIdTokenError("AUD_MISMATCH", "aud mismatch")
    );
    const r = await submitOnboarding(VALID_INPUT);
    expect(r).toEqual({ status: "service_unavailable" });
  });

  it("verify ISS_MISMATCH → service_unavailable", async () => {
    mockVerify.mockRejectedValueOnce(
      new LiffIdTokenError("ISS_MISMATCH", "iss mismatch")
    );
    const r = await submitOnboarding(VALID_INPUT);
    expect(r).toEqual({ status: "service_unavailable" });
  });

  it("verify INVALID → service_unavailable", async () => {
    mockVerify.mockRejectedValueOnce(
      new LiffIdTokenError("INVALID", "bad signature")
    );
    const r = await submitOnboarding(VALID_INPUT);
    expect(r).toEqual({ status: "service_unavailable" });
  });

  it("verify throws non-LiffIdTokenError → service_unavailable", async () => {
    mockVerify.mockRejectedValueOnce(new Error("unexpected"));
    const r = await submitOnboarding(VALID_INPUT);
    expect(r).toEqual({ status: "service_unavailable" });
  });

  // ────────────────────────────────────────────────────────
  // Store / config edges
  // ────────────────────────────────────────────────────────

  it("resolveStoreBySlug returns null → service_unavailable", async () => {
    mockVerify.mockResolvedValueOnce(verifiedOk());
    mockResolveStoreBySlug.mockResolvedValueOnce(null);
    const r = await submitOnboarding(VALID_INPUT);
    expect(r).toEqual({ status: "service_unavailable" });
    expect(mockBindLine).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────
  // Input shape edges
  // ────────────────────────────────────────────────────────

  it("missing idToken in input → service_unavailable (caller bug)", async () => {
    const r = await submitOnboarding({ ...VALID_INPUT, idToken: "" });
    expect(r).toEqual({ status: "service_unavailable" });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("missing storeSlug in input → service_unavailable", async () => {
    const r = await submitOnboarding({ ...VALID_INPUT, storeSlug: "" });
    expect(r).toEqual({ status: "service_unavailable" });
  });

  it("empty name in input → service_unavailable (caller should pre-validate)", async () => {
    const r = await submitOnboarding({ ...VALID_INPUT, name: "" });
    expect(r).toEqual({ status: "service_unavailable" });
  });

  it("empty phone in input → service_unavailable (caller should pre-validate)", async () => {
    const r = await submitOnboarding({ ...VALID_INPUT, phone: "" });
    expect(r).toEqual({ status: "service_unavailable" });
  });

  // ────────────────────────────────────────────────────────
  // Helper invocation contract
  // ────────────────────────────────────────────────────────

  it("passes verified lineUserId / lineName / storeId to helper", async () => {
    mockVerify.mockResolvedValueOnce(verifiedOk({ displayName: "DisplayName from LINE" }));
    mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
    mockBindLine.mockResolvedValueOnce({
      status: "created_new",
      customerId: "c",
      userId: "u",
      lineAccountSync: "created",
    });

    await submitOnboarding(VALID_INPUT);

    expect(mockBindLine).toHaveBeenCalledWith({
      storeId: STORE.id,
      lineUserId: LINE_USER_ID,
      lineName: "DisplayName from LINE",
      phone: VALID_INPUT.phone,
      name: VALID_INPUT.name,
      allowCreate: false,
    });
  });

  it("verifies idToken with the central member LINE channel", async () => {
    mockVerify.mockResolvedValueOnce(verifiedOk());
    mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
    mockBindLine.mockResolvedValueOnce({
      status: "already_synced",
      customerId: "c",
      userId: "u",
    });

    await submitOnboarding(VALID_INPUT);

    expect(mockVerify).toHaveBeenCalledWith(VALID_INPUT.idToken, CHANNEL);
  });
});
