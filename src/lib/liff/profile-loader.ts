import { refreshLiffSession } from "./session-refresh";
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
  const loadProfile = deps.loadProfile ?? fetchLiffCustomerProfile;
  const session = await refreshLiffSession(
    { idToken: deps.idToken, storeSlug: deps.storeSlug }, deps.exchange,
  );
  if (session.status !== "session_created") return { kind: session.status };

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
