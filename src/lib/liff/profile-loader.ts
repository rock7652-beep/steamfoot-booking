/**
 * loadProfileWithSessionRefresh — PR #257 round 4 (Codex P2 cross-customer leak fix)
 *
 * Wraps the LIFF profile-page load sequence so that the NextAuth session is
 * ALWAYS refreshed via `/api/liff/exchange` BEFORE `fetchLiffCustomerProfile`
 * is invoked. This prevents the cross-customer data-leak risk where:
 *
 *   - Customer A logged in to LIFF earlier → NextAuth cookie set for A
 *   - LINE WebView later swaps to customer B (multi-LINE-account on
 *     same device, or A logged out of LINE) without clearing Steamfoot
 *     cookies
 *   - Customer B opens /s/{slug}/liff/profile → page reads cached
 *     cookie session → returns customer A's name / phone / email
 *
 * The exchange call verifies the CURRENT LIFF `idToken` against
 * `verifyLiffIdToken` and resets the NextAuth session to match the
 * current LINE user. Only after `session_created` (or equivalent
 * success) is it safe to read the customer profile via the existing
 * server action.
 *
 * This helper is INJECTABLE for testing: both the exchange call and
 * the profile load can be overridden via the `deps.exchange` /
 * `deps.loadProfile` options. Production calls use the defaults
 * (`fetch("/api/liff/exchange", ...)` + `fetchLiffCustomerProfile`).
 *
 * Out of scope (per PR #257 brief):
 *   - Does NOT touch `auth.ts` / D3 / D5 / webhook / oauth-confirm
 *   - Does NOT add a new `syncLineAccountForUser` caller
 *   - Does NOT modify `fetchLiffCustomerProfile`'s read-only contract
 *   - Does NOT write DB / modify schema / migration / env
 *   - Does NOT change UI copy (caller's view component already handles
 *     all of the returned `kind` states via its existing state machine)
 */

import {
  fetchLiffCustomerProfile,
  type FetchLiffCustomerProfileResult,
} from "@/server/actions/liff-customer-profile";

/**
 * Response body shape from POST `/api/liff/exchange`.
 *
 * Mirrors the type used in `liff-shell.tsx`; duplicated here to avoid
 * pulling the entire shell client component into this small helper.
 * The route's contract is the source of truth; if it evolves, this
 * type must be updated in lockstep.
 */
type ExchangeResponse =
  | { status: "session_created"; displayName: string | null }
  | { status: "need_onboarding"; displayName: string | null }
  | { status: "error"; code?: string };

/**
 * Discriminated-union result for the profile page's view-layer state
 * machine. Caller maps each `kind` to a specific UI state:
 *
 *   - "ok"              → render profile
 *   - "need_onboarding" → redirect to /s/{slug}/liff/onboarding
 *                          (mirrors liff-shell's signed_in vs
 *                          need_onboarding branch behaviour)
 *   - "expired"         → render the "session 已逾時，請重新整理" view
 *   - "no_customer"     → render the "找不到您的會員資料" view
 *   - "service_unavailable" → render the retry / contact-store view
 *
 * Note: `not_in_line_app` is NOT a return value — that branch is
 * detected client-side via `isInLineClient()` BEFORE this helper is
 * ever invoked.
 */
export type LoadProfileResult =
  | {
      kind: "ok";
      profile: Extract<
        FetchLiffCustomerProfileResult,
        { status: "ok" }
      >["profile"];
    }
  | { kind: "need_onboarding" }
  | { kind: "expired" }
  | { kind: "no_customer" }
  | { kind: "service_unavailable" };

export interface LoadProfileDeps {
  /** Current LIFF idToken from `liff.getIDToken()`. */
  idToken: string;
  /** Current store slug from the page's server-resolved presentation. */
  storeSlug: string;
  /**
   * Optional override for testing. Defaults to a `fetch("/api/liff/exchange", ...)`
   * POST that the existing liff-shell.tsx production path uses.
   * Returning `null` is treated as "service_unavailable" (network /
   * parse failure).
   */
  exchange?: (input: {
    idToken: string;
    storeSlug: string;
  }) => Promise<ExchangeResponse | null>;
  /**
   * Optional override for testing. Defaults to `fetchLiffCustomerProfile()`
   * — the existing read-only server action whose contract is unchanged
   * by this PR.
   */
  loadProfile?: () => Promise<FetchLiffCustomerProfileResult>;
}

/**
 * Refresh NextAuth session via /api/liff/exchange, THEN (and only then)
 * load the customer profile.
 *
 * HARD INVARIANT: `loadProfile` is NEVER called unless the exchange
 * step returned `session_created`. Every other exchange outcome
 * (`need_onboarding` / `error.*` / null body / thrown) short-circuits
 * with the corresponding `kind` — the test suite asserts this on
 * every branch.
 *
 * This is the contract that prevents the cross-customer leak: a stale
 * cookie cannot be exercised because we always verify the session
 * against the current LIFF idToken first.
 */
export async function loadProfileWithSessionRefresh(
  deps: LoadProfileDeps,
): Promise<LoadProfileResult> {
  const exchange = deps.exchange ?? defaultExchange;
  const loadProfile = deps.loadProfile ?? fetchLiffCustomerProfile;

  // ── STEP 1: refresh NextAuth session via /api/liff/exchange ──
  // MUST run before any cookie-reading data fetch. The exchange route
  // verifies the LIFF idToken server-side and re-signs the NextAuth
  // session for the CURRENT LINE user. Without this step, the next
  // statement (loadProfile) would read whatever cookie happens to be
  // in the browser — possibly a different customer's session.
  let exchangeBody: ExchangeResponse | null;
  try {
    exchangeBody = await exchange({
      idToken: deps.idToken,
      storeSlug: deps.storeSlug,
    });
  } catch (err) {
    // Network / parse error during the exchange — surface as
    // service_unavailable so the view shows a retry CTA. Crucially,
    // we do NOT proceed to loadProfile here (would expose stale data).
    console.warn(
      "[loadProfileWithSessionRefresh] exchange fetch threw",
      err,
    );
    return { kind: "service_unavailable" };
  }
  if (!exchangeBody) {
    return { kind: "service_unavailable" };
  }

  // ── STEP 2: dispatch on exchange result ──
  // ONLY `session_created` proceeds to STEP 3. Every other branch
  // short-circuits — the helper MUST NOT read profile data under any
  // session that wasn't just verified against the current LIFF token.
  if (exchangeBody.status === "need_onboarding") {
    return { kind: "need_onboarding" };
  }
  if (exchangeBody.status === "error") {
    // Customer-facing partition: token expiry / invalidity → "expired"
    // (view shows retry hint). Any other error code → service_unavailable.
    // Matches the partition used by liff-shell.tsx exchange-error block.
    if (
      exchangeBody.code === "ID_TOKEN_EXPIRED" ||
      exchangeBody.code === "ID_TOKEN_INVALID"
    ) {
      return { kind: "expired" };
    }
    return { kind: "service_unavailable" };
  }
  // exchangeBody.status === "session_created" (the only success branch)

  // ── STEP 3: now safe to load profile ──
  // The NextAuth session has just been refreshed to match the current
  // LIFF identity; `fetchLiffCustomerProfile`'s `requireSession` will
  // resolve the correct customer.
  let profileResult: FetchLiffCustomerProfileResult;
  try {
    profileResult = await loadProfile();
  } catch (err) {
    // Defensive: the action shouldn't throw on expected branches per
    // its discriminated-union contract, but a network / RSC transport
    // error could still surface here.
    console.warn(
      "[loadProfileWithSessionRefresh] loadProfile threw",
      err,
    );
    return { kind: "service_unavailable" };
  }

  if (profileResult.status === "ok") {
    return { kind: "ok", profile: profileResult.profile };
  }
  if (profileResult.status === "no_customer") {
    return { kind: "no_customer" };
  }
  // profileResult.status === "service_unavailable"
  return { kind: "service_unavailable" };
}

/**
 * Default exchange implementation — POST `/api/liff/exchange` with
 * `{idToken, storeSlug}`. Production callers use this; tests inject
 * their own via `deps.exchange`.
 */
async function defaultExchange(input: {
  idToken: string;
  storeSlug: string;
}): Promise<ExchangeResponse | null> {
  const res = await fetch("/api/liff/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await res.json().catch(() => null)) as ExchangeResponse | null;
}
