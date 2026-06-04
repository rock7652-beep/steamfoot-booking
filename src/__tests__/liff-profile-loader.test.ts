/**
 * loadProfileWithSessionRefresh tests (PR #257 round 4 — Codex P2 cross-customer leak fix)
 *
 * HARD INVARIANT (verified across multiple tests below):
 *   `loadProfile` MUST NEVER be called unless the exchange step returned
 *   `session_created`. This is the contract that prevents the stale-cookie
 *   cross-customer leak — if a previously-logged-in customer's NextAuth
 *   cookie is still present when a different LINE user opens the LIFF
 *   profile page, the exchange call returns either `need_onboarding`
 *   (different LINE user, no Customer match), `error.ID_TOKEN_*`
 *   (stale token), or success for the CURRENT user (in which case
 *   reading the profile is safe).
 *
 * Coverage:
 *   ── exchange success / failure paths ──
 *     - session_created → loadProfile called → returns ok
 *     - need_onboarding → loadProfile NOT called → returns need_onboarding
 *     - error.ID_TOKEN_EXPIRED → loadProfile NOT called → returns expired
 *     - error.ID_TOKEN_INVALID → loadProfile NOT called → returns expired
 *     - error.<other> → loadProfile NOT called → returns service_unavailable
 *     - exchange returns null (network/parse failure) → loadProfile NOT called → service_unavailable
 *     - exchange throws → loadProfile NOT called → service_unavailable
 *
 *   ── post-exchange loadProfile branches ──
 *     - session_created + profile ok → ok
 *     - session_created + profile no_customer → no_customer
 *     - session_created + profile service_unavailable → service_unavailable
 *     - session_created + profile throws → service_unavailable
 *
 *   ── call-order invariant (multiple tests assert this) ──
 *     - exchange is called exactly once with the correct {idToken, storeSlug}
 *     - loadProfile is called at most once, and only after exchange success
 */
import { describe, it, expect, vi } from "vitest";

// Mock the server-action module before the helper module-loads it.
// Required because `liff-customer-profile.ts` is a `"use server"` file that
// transitively imports `@/lib/session` → `@/lib/auth` → `next-auth`. Loading
// the real chain in vitest fails with `Cannot find module 'next/server'`
// (Next.js 16 module-resolution quirk in the test environment).
//
// All loader tests inject their own `loadProfile` via `deps.loadProfile`, so
// this mock fallback is never exercised — the `vi.fn()` is only here so the
// loader's default import resolves to a callable at module-load time.
vi.mock("@/server/actions/liff-customer-profile", () => ({
  fetchLiffCustomerProfile: vi.fn(),
}));

import { loadProfileWithSessionRefresh } from "@/lib/liff/profile-loader";

const SLUG = "zhubei";
const ID_TOKEN = "test-id-token-abc";
const SAMPLE_PROFILE = {
  id: "cust-001",
  name: "王小明",
  phone: "0912345678",
  email: "test@example.com",
  lineStatus: "linked" as const,
  lineName: "LINE 暱稱",
  lineUserIdMasked: "U******cdef",
  storeName: "暖暖蒸足 竹北店",
  storeSlug: SLUG,
};

// ════════════════════════════════════════════════════════════════════════════
// 1. Happy path: exchange session_created → loadProfile → ok
// ════════════════════════════════════════════════════════════════════════════

describe("ok (session_created + profile loaded)", () => {
  it("calls exchange once with correct {idToken, storeSlug}; THEN calls loadProfile; returns ok", async () => {
    const exchange = vi.fn().mockResolvedValueOnce({
      status: "session_created",
      displayName: "LINE 暱稱",
    });
    const loadProfile = vi.fn().mockResolvedValueOnce({
      status: "ok",
      profile: SAMPLE_PROFILE,
    });

    const r = await loadProfileWithSessionRefresh({
      idToken: ID_TOKEN,
      storeSlug: SLUG,
      exchange,
      loadProfile,
    });

    expect(r).toEqual({ kind: "ok", profile: SAMPLE_PROFILE });
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledWith({
      idToken: ID_TOKEN,
      storeSlug: SLUG,
    });
    expect(loadProfile).toHaveBeenCalledTimes(1);
    // Call ORDER invariant: exchange must resolve before loadProfile fires
    // (mock.invocationCallOrder asserts this — earlier index = earlier call)
    const exchangeOrder = exchange.mock.invocationCallOrder[0]!;
    const loadProfileOrder = loadProfile.mock.invocationCallOrder[0]!;
    expect(exchangeOrder).toBeLessThan(loadProfileOrder);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. Exchange short-circuits: every non-session_created branch MUST NOT
//    invoke loadProfile (the cross-customer leak protection)
// ════════════════════════════════════════════════════════════════════════════

describe("exchange short-circuits — loadProfile NEVER called (CROSS-CUSTOMER LEAK PROTECTION)", () => {
  it("need_onboarding → returns need_onboarding; loadProfile NOT called", async () => {
    const exchange = vi.fn().mockResolvedValueOnce({
      status: "need_onboarding",
      displayName: "Some LINE User",
    });
    const loadProfile = vi.fn();

    const r = await loadProfileWithSessionRefresh({
      idToken: ID_TOKEN,
      storeSlug: SLUG,
      exchange,
      loadProfile,
    });

    expect(r).toEqual({ kind: "need_onboarding" });
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("error.ID_TOKEN_EXPIRED → returns expired; loadProfile NOT called", async () => {
    const exchange = vi.fn().mockResolvedValueOnce({
      status: "error",
      code: "ID_TOKEN_EXPIRED",
    });
    const loadProfile = vi.fn();

    const r = await loadProfileWithSessionRefresh({
      idToken: ID_TOKEN,
      storeSlug: SLUG,
      exchange,
      loadProfile,
    });

    expect(r).toEqual({ kind: "expired" });
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("error.ID_TOKEN_INVALID → returns expired; loadProfile NOT called", async () => {
    const exchange = vi.fn().mockResolvedValueOnce({
      status: "error",
      code: "ID_TOKEN_INVALID",
    });
    const loadProfile = vi.fn();

    const r = await loadProfileWithSessionRefresh({
      idToken: ID_TOKEN,
      storeSlug: SLUG,
      exchange,
      loadProfile,
    });

    expect(r).toEqual({ kind: "expired" });
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("error.<other> → returns service_unavailable; loadProfile NOT called", async () => {
    const exchange = vi.fn().mockResolvedValueOnce({
      status: "error",
      code: "UNKNOWN_BACKEND_ERROR",
    });
    const loadProfile = vi.fn();

    const r = await loadProfileWithSessionRefresh({
      idToken: ID_TOKEN,
      storeSlug: SLUG,
      exchange,
      loadProfile,
    });

    expect(r).toEqual({ kind: "service_unavailable" });
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("error with no code → service_unavailable; loadProfile NOT called", async () => {
    const exchange = vi.fn().mockResolvedValueOnce({
      status: "error",
    });
    const loadProfile = vi.fn();

    const r = await loadProfileWithSessionRefresh({
      idToken: ID_TOKEN,
      storeSlug: SLUG,
      exchange,
      loadProfile,
    });

    expect(r).toEqual({ kind: "service_unavailable" });
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("exchange returns null (network / parse failure) → service_unavailable; loadProfile NOT called", async () => {
    const exchange = vi.fn().mockResolvedValueOnce(null);
    const loadProfile = vi.fn();

    const r = await loadProfileWithSessionRefresh({
      idToken: ID_TOKEN,
      storeSlug: SLUG,
      exchange,
      loadProfile,
    });

    expect(r).toEqual({ kind: "service_unavailable" });
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("exchange throws → service_unavailable; loadProfile NOT called", async () => {
    const exchange = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const loadProfile = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await loadProfileWithSessionRefresh({
      idToken: ID_TOKEN,
      storeSlug: SLUG,
      exchange,
      loadProfile,
    });

    expect(r).toEqual({ kind: "service_unavailable" });
    expect(loadProfile).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "[loadProfileWithSessionRefresh] exchange fetch threw",
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. Post-exchange loadProfile branches (only reachable after session_created)
// ════════════════════════════════════════════════════════════════════════════

describe("post-exchange loadProfile branches (only reachable after session_created)", () => {
  function exchangeSuccess() {
    return vi.fn().mockResolvedValueOnce({
      status: "session_created",
      displayName: "LINE 暱稱",
    });
  }

  it("session_created + profile ok → ok", async () => {
    const r = await loadProfileWithSessionRefresh({
      idToken: ID_TOKEN,
      storeSlug: SLUG,
      exchange: exchangeSuccess(),
      loadProfile: vi
        .fn()
        .mockResolvedValueOnce({ status: "ok", profile: SAMPLE_PROFILE }),
    });
    expect(r).toEqual({ kind: "ok", profile: SAMPLE_PROFILE });
  });

  it("session_created + profile no_customer → no_customer", async () => {
    // This is a real race: exchange succeeded (LIFF idToken is valid +
    // there exists a Customer for this lineUserId at this store), but
    // between exchange and profile fetch the Customer was deleted /
    // merged away. Surface honestly rather than service_unavailable.
    const r = await loadProfileWithSessionRefresh({
      idToken: ID_TOKEN,
      storeSlug: SLUG,
      exchange: exchangeSuccess(),
      loadProfile: vi.fn().mockResolvedValueOnce({ status: "no_customer" }),
    });
    expect(r).toEqual({ kind: "no_customer" });
  });

  it("session_created + profile service_unavailable → service_unavailable", async () => {
    const r = await loadProfileWithSessionRefresh({
      idToken: ID_TOKEN,
      storeSlug: SLUG,
      exchange: exchangeSuccess(),
      loadProfile: vi
        .fn()
        .mockResolvedValueOnce({ status: "service_unavailable" }),
    });
    expect(r).toEqual({ kind: "service_unavailable" });
  });

  it("session_created + loadProfile throws → service_unavailable (defensive — action shouldn't throw on expected branches but RSC transport could)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await loadProfileWithSessionRefresh({
      idToken: ID_TOKEN,
      storeSlug: SLUG,
      exchange: exchangeSuccess(),
      loadProfile: vi
        .fn()
        .mockRejectedValueOnce(new Error("RSC transport error")),
    });

    expect(r).toEqual({ kind: "service_unavailable" });
    expect(warnSpy).toHaveBeenCalledWith(
      "[loadProfileWithSessionRefresh] loadProfile threw",
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Cross-customer leak protection — explicit narrative regression guard
// ════════════════════════════════════════════════════════════════════════════

describe("cross-customer leak protection — narrative regression guards", () => {
  it("STALE COOKIE SCENARIO: cookie holds customer A's session, but current LIFF idToken belongs to customer B → exchange returns need_onboarding (or session_created for B) — never reads A's profile", async () => {
    // Scenario: customer A previously authenticated; cookie still set.
    // Customer B opens the same LIFF page. The LIFF idToken is now B's.
    // The exchange route verifies B's idToken and would either:
    //   - Find a Customer for B → session_created (which then resets the
    //     NextAuth session to B; the subsequent loadProfile reads B's data)
    //   - Not find a Customer for B → need_onboarding (short-circuit before
    //     loadProfile fires; A's stale cookie is never exercised)
    //
    // In NEITHER case can A's profile leak. This test pins the
    // need_onboarding branch — the more dangerous of the two (A's cookie
    // is still in the browser).
    const exchange = vi.fn().mockResolvedValueOnce({
      status: "need_onboarding",
      displayName: "Customer B",
    });
    // CRITICAL: loadProfile is a mock that, if called, would return
    // customer A's data (simulating what a stale cookie would yield).
    // The test verifies it's NEVER called.
    const loadProfile = vi.fn().mockResolvedValueOnce({
      status: "ok",
      profile: {
        ...SAMPLE_PROFILE,
        name: "Customer A — LEAK SENTINEL",
      },
    });

    const r = await loadProfileWithSessionRefresh({
      idToken: ID_TOKEN,
      storeSlug: SLUG,
      exchange,
      loadProfile,
    });

    // Customer A's profile was NOT returned to the caller.
    expect(r).toEqual({ kind: "need_onboarding" });
    if ((r as { kind: string }).kind === "ok") {
      throw new Error(
        "CROSS-CUSTOMER LEAK: customer A's profile reached the caller " +
          "despite exchange returning need_onboarding for customer B",
      );
    }
    // And — the most important assertion — loadProfile (which would
    // have read the stale cookie) was never invoked.
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("STALE TOKEN SCENARIO: cookie holds customer A's session, but LIFF idToken is expired → exchange returns error.ID_TOKEN_EXPIRED — never reads A's profile", async () => {
    const exchange = vi.fn().mockResolvedValueOnce({
      status: "error",
      code: "ID_TOKEN_EXPIRED",
    });
    const loadProfile = vi.fn().mockResolvedValueOnce({
      status: "ok",
      profile: {
        ...SAMPLE_PROFILE,
        name: "Customer A — LEAK SENTINEL",
      },
    });

    const r = await loadProfileWithSessionRefresh({
      idToken: ID_TOKEN,
      storeSlug: SLUG,
      exchange,
      loadProfile,
    });

    expect(r).toEqual({ kind: "expired" });
    expect(loadProfile).not.toHaveBeenCalled();
  });
});
