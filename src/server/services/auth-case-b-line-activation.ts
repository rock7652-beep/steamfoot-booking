/**
 * auth-case-b-line-activation.ts — PR-G5.5.a wiring helper
 *
 * Single purpose: adapt the NextAuth `signIn` callback's LINE Case B
 * branch (`existing Customer && Customer.userId === null && provider === "line"`)
 * to the canonical D5 helper `activatePrecreatedCustomerWithLine`.
 *
 * Why a separate file?
 *   - The signIn callback in src/lib/auth.ts is structurally hard to unit-test
 *     (NextAuth() inlines the callbacks inside a provider config object).
 *   - Extracting just the Case-B LINE wiring keeps the auth.ts diff minimal
 *     while making the wiring contract testable in isolation (deterministic
 *     status mapping per D5 outcome, no DB, no fetch).
 *   - PR-G5.5.b (Case A → D3) is expected to mirror this shape with a
 *     sibling helper file.
 *
 * Scope (PR-G5.5.a hard guarantee):
 *   ✅ This helper REPLACES the 3-write inline path
 *      `prisma.user.create + prisma.account.create + prisma.customer.update`
 *      that currently lives at src/lib/auth.ts lines 620-703 for the LINE
 *      branch of Case B. The 3 writes collapse into a single atomic
 *      Serializable transaction inside D5.
 *   ❌ This helper does NOT touch Case A (existing User), Case C (no Customer),
 *      the Google branch of Case B, the signed-stage flow, oauth-confirm,
 *      LIFF onboarding, or the webhook.
 *   ❌ This helper does NOT run any post-tx best-effort side effects
 *      (referral / identity-repair / structured log on success). Those stay
 *      in auth.ts at the same call site as today — byte-equivalent vs the
 *      pre-PR-G5.5.a inline flow.
 *
 * Byte-equivalent contract (PR-G5.1.b §1597):
 *   D5 was explicitly designed as the byte-equivalent refactor target for
 *   the inline Case B writes. With `customerNameOverride` UNSET (this
 *   caller never sets it — auth.ts Case B baseline does not write
 *   Customer.name), D5's end-state DB rows match the pre-refactor 3-write
 *   inline path bit-for-bit:
 *
 *     User row:     name = customer.name  (from in-tx snapshot)
 *                   phone = customer.phone (or null fallback)
 *                   email = oauthProfile.email
 *                   image = oauthProfile.image
 *                   role = "CUSTOMER", status = "ACTIVE"
 *     Account row:  10 fields, NO session_state
 *                   provider = "line", providerAccountId = lineUserId
 *                   (canonical literals — PR #243 Codex P2 round 17)
 *                   all OAuth token fields preserved as-given
 *     Customer row: userId / authSource:"LINE" / lineUserId / lineLinkStatus
 *                   / lineLinkedAt / lineName (truthy gate)
 *                   Customer.name is NOT rewritten (baseline behaviour)
 *
 *   On any D5 failure (StaleCustomerLinkError / P2034 / P2002 / preflight
 *   reject), the Serializable rollback guarantees NO partial state can be
 *   committed — closes the orphan-User / orphan-Account / half-updated-
 *   Customer window that the inline 3-write path always had.
 */

import { activatePrecreatedCustomerWithLine } from "./bind-line-to-customer";
import {
  logLineBindEvent,
  type LineBindEvent,
} from "@/lib/line-bind-log";

/**
 * Trusted wiring input from the auth.ts signIn callback. Caller is
 * responsible for guaranteeing:
 *
 *   - `storeId` has been resolved from a trusted source (the
 *     resolveStoreFromOAuthCookie path in auth.ts).
 *   - `customer.userId === null` AND `provider === "line"` AND
 *     `customer.storeId === storeId` (the Case B lookup precondition
 *     already enforces these in auth.ts before this helper is invoked).
 *   - `lineUserId` came from a verified OAuth handshake AND equals
 *     `account.providerAccountId`.
 */
export interface AuthCaseBLineActivationInput {
  /** Trusted store context resolved by auth.ts before dispatch. */
  storeId: string;
  /** Customer.id returned by auth.ts's Case B lookup (userId === null). */
  customerId: string;
  /** Customer.phone from the lookup row (for post-tx identity-repair). */
  customerPhone: string | null;
  /** Verified LINE userId; must equal `account.providerAccountId`. */
  lineUserId: string;
  /**
   * `user.name ?? "顧客"` from the OAuth profile (matches auth.ts inline
   * baseline). Used as `oauthProfile.name` AND `oauthAccount.lineName`
   * source for D5's `deriveEffectiveLineName` chain.
   */
  oauthName: string;
  /** `user.email` from the OAuth profile; null permitted. */
  oauthEmail: string | null | undefined;
  /** `user.image` from the OAuth profile; null permitted. */
  oauthImage: string | null | undefined;
  /**
   * NextAuth `account` object (LINE provider). The helper synthesizes
   * D5's `oauthAccount` from this shape — `provider` is forced to "line"
   * and `providerAccountId` is forced to `lineUserId` (PR #243 Codex P2
   * round 17 canonical literals).
   */
  account: {
    type: string;
    provider: string;
    providerAccountId: string;
    access_token?: string | null | undefined;
    refresh_token?: string | null | undefined;
    id_token?: string | null | undefined;
    expires_at?: number | null | undefined;
    scope?: string | null | undefined;
    token_type?: string | null | undefined;
  };
}

/**
 * Discriminated union return — caller (auth.ts) maps `ok:true` to
 * `user.id = result.userId` + return true, and `ok:false` to return false
 * (NextAuth surfaces as a signin failure; the user re-attempts and the
 * lookup re-evaluates the Customer's new state).
 *
 * The `reason` field is intentionally narrow — it's NOT user-facing,
 * just for caller-side handling + downstream metric aggregation.
 */
export type AuthCaseBLineActivationResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      /**
       * Specific D5 rejection class, surfaced in the structured
       * `unexpected_error` log as `errorCode: "d5_<reason>"`. The
       * caller treats all `ok:false` outcomes identically (return
       * false from signIn).
       */
      reason:
        | "customer_already_has_user"
        | "customer_already_linked_to_other_line"
        | "stale_customer_link"
        | "unique_conflict"
        | "write_conflict"
        | "store_mismatch"
        | "line_account_mismatch";
    };

/**
 * Activate a staff-precreated Customer via a LINE OAuth first-login, by
 * delegating to D5 inside a single Serializable transaction.
 *
 * Returns a discriminated union; NEVER throws on expected D5 outcomes.
 * (D5 itself can still re-throw unrelated Prisma errors — the auth.ts
 * outer try/catch at the signIn callback catches those, preserving
 * today's behaviour.)
 */
export async function activateLineCaseBForAuthSignIn(
  input: AuthCaseBLineActivationInput,
): Promise<AuthCaseBLineActivationResult> {
  const result = await activatePrecreatedCustomerWithLine({
    storeId: input.storeId,
    customerId: input.customerId,
    lineUserId: input.lineUserId,
    // D5's `lineName` is the LINE displayName for Customer.lineName.
    // auth.ts baseline uses `oauthName` (≡ `user.name ?? "顧客"`) — keep
    // identical to preserve `if (oauthName) updateData.lineName = oauthName`
    // truthy-gate semantics.
    lineName: input.oauthName,
    oauthProfile: {
      email: input.oauthEmail,
      image: input.oauthImage,
      // D5's `deriveEffectiveLineName` chain is
      // `input.lineName ?? oauthProfile.name ?? "顧客"`. auth.ts baseline
      // collapses to just `oauthName` end-to-end; setting both to the
      // same value preserves the truthy-gate behaviour vs baseline.
      name: input.oauthName,
    },
    oauthAccount: {
      // Canonical literals (PR #243 Codex P2 round 17). These MUST equal
      // each other AND `input.lineUserId` — D5's step-1 validation
      // enforces this; the `line_account_mismatch` return is unreachable
      // by construction here.
      provider: "line",
      providerAccountId: input.lineUserId,
      type: input.account.type,
      // OAuth tokens preserved as-given (null → null; undefined →
      // undefined; string → string). D5's round-9 token-pass-through
      // contract guarantees these end up in the Account row unchanged
      // vs the inline baseline.
      access_token: input.account.access_token ?? null,
      refresh_token: input.account.refresh_token ?? null,
      id_token: input.account.id_token ?? null,
      expires_at: input.account.expires_at ?? null,
      scope: input.account.scope ?? null,
      token_type: input.account.token_type ?? null,
    },
    // ⚠ INTENTIONALLY OMITTED: `customerNameOverride`.
    //
    //   auth.ts Case B baseline (pre-PR-G5.5.a) does NOT write
    //   Customer.name (see auth.ts lines 649-663: `updateData` includes
    //   authSource / lineUserId / lineLinkStatus / lineLinkedAt /
    //   lineName — but NOT `name`). Leaving `customerNameOverride`
    //   undefined makes D5's tx body skip the `name` field in
    //   Customer.updateMany.data AND read User.name from the in-tx
    //   Customer snapshot (≡ `customer.name` in auth.ts inline) —
    //   preserving byte-equivalence per PR-G5.2.b round 2 + PR-G5.1.b
    //   §1597.
  });

  if (result.status === "activated") {
    return { ok: true, userId: result.userId };
  }

  // Every other D5 status is a controlled rejection (no partial state
  // committed — D5's Serializable tx rolled back). Surface as a
  // structured `unexpected_error` log + return `{ok:false, reason}`
  // so the caller short-circuits to `return false`.
  //
  // We do NOT throw — auth.ts's outer try/catch would catch a throw
  // and treat it as the generic "unexpected_error" path with
  // `errorCode: error.name`, losing the specific D5 status. The
  // explicit log here preserves the diagnostic signal.
  const reason = mapD5RejectionToReason(result.status);
  const evt: LineBindEvent = {
    path: "oauth-line-signin",
    status: "unexpected_error",
    storeId: input.storeId,
    lineUserId: input.lineUserId,
    customerId: input.customerId,
    errorCode: `d5_${reason}`,
  };
  logLineBindEvent(evt);
  return { ok: false, reason };
}

/**
 * Map D5's rejection statuses to the narrow `reason` enum on
 * AuthCaseBLineActivationResult. Total + exhaustive.
 */
function mapD5RejectionToReason(
  status: Exclude<
    Awaited<ReturnType<typeof activatePrecreatedCustomerWithLine>>["status"],
    "activated"
  >,
): Exclude<
  AuthCaseBLineActivationResult,
  { ok: true }
>["reason"] {
  switch (status) {
    case "customer_already_has_user":
    case "customer_already_linked_to_other_line":
    case "stale_customer_link":
    case "unique_conflict":
    case "write_conflict":
    case "store_mismatch":
    case "line_account_mismatch":
      return status;
  }
}
