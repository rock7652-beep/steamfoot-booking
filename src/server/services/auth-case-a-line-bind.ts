/**
 * auth-case-a-line-bind.ts — PR-G5.5.b wiring helper
 *
 * Single purpose: adapt the NextAuth `signIn` callback's LINE Case A
 * branch (`existing Customer && Customer.userId !== null && provider === "line"`)
 * to the canonical D3 helper `bindLineToExistingCustomerById` extended
 * with the optional 10-field `oauthAccount` input (PR-G5.5.b stage 1).
 *
 * Why a separate file?
 *   - Mirrors the G5.5.a sibling pattern (auth-case-b-line-activation.ts)
 *     for consistency.
 *   - The signIn callback in src/lib/auth.ts is structurally hard to
 *     unit-test (NextAuth() inlines callbacks inside a provider config).
 *     Extracting Case A's LINE wiring keeps the auth.ts diff minimal
 *     while making the D3 status → wiring contract testable in
 *     isolation.
 *
 * Scope (PR-G5.5.b hard guarantee):
 *   ✅ This helper REPLACES the 2-write inline path
 *      `prisma.account.create + prisma.customer.update` that currently
 *      lives at src/lib/auth.ts lines 531-573 for the LINE branch of
 *      Case A. Both writes collapse into a single atomic Serializable
 *      transaction inside D3 — closes the "Account.create succeeded but
 *      Customer.update failed" drift window that the inline path always
 *      had.
 *   ❌ This helper does NOT touch the Google branch of Case A (the
 *      caller in auth.ts keeps the inline path for non-LINE providers).
 *   ❌ This helper does NOT touch Case B, Case C, oauth-confirm, the
 *      signed-stage flow, LIFF onboarding, or the webhook.
 *   ❌ This helper does NOT run post-tx best-effort side effects
 *      (awardLineJoinReferrerIfEligible / repairCustomerIdentityOnLogin /
 *      success log). Those stay in auth.ts at the same call site as
 *      today — byte-equivalent vs the pre-PR-G5.5.b inline flow.
 *
 * Behaviour-change envelope (defensible tightening, see PR audit §5)
 * ------------------------------------------------------------------
 * Current Case A inline silently tolerates the cross-user Account
 * conflict case: if `Account[line, providerAccountId]` exists but
 * `Account.userId !== customer.userId`, the inline code SKIPS
 * Account.create (good) but STILL proceeds to update Customer.lineUserId
 * (silent drift — the customer's row now says "linked to LINE X" but
 * the Account row for LINE X is owned by a different User).
 *
 * D3 step 5a-ii / step 5.6-b detects this case and returns
 * `customer_locked` — the helper translates to `{ok:false, …}` and the
 * caller returns false (signin failure). This is the DEFENSIBLE
 * TIGHTENING the user explicitly approved in the PR-G5.5 preflight
 * audit: "controlled failure / customer_locked，不要 partial write".
 *
 * D3 status → wiring result mapping
 * ----------------------------------
 *   bound_existing      | ok:true  | justLinkedLine: true  | accountSync: "created"
 *                       |          | (Customer.lineUserId was null → set; Account created in tx)
 *   customer_repaired   | ok:true  | justLinkedLine: true  | accountSync: "noop_already_synced"
 *                       |          | (Customer.lineUserId went null → set; Account already existed
 *                       |          |  for same user, no new Account row written)
 *   account_repaired    | ok:true  | justLinkedLine: false | accountSync: "created"
 *                       |          | (Customer.lineUserId was already set → no fresh binding;
 *                       |          |  Account row was missing and now created)
 *   already_synced      | ok:true  | justLinkedLine: false | accountSync: "noop_already_synced"
 *                       |          | (idempotent no-op; nothing changed)
 *   customer_locked     | ok:false | (cross-user Account collision OR different LINE on Customer)
 *   unique_conflict     | ok:false | (P2002 race in tx; Serializable rollback — 0 partial state)
 *   write_conflict      | ok:false | (P2034 Serializable retry exhausted; rollback)
 *   stale_customer_link | ok:false | (in-tx CAS lost race; rollback)
 *   store_mismatch      | ok:false | (defensive — auth.ts already verified)
 *   customer_has_no_user| ok:false | (defensive — caller's Case A precondition guarantees userId)
 *
 * The `justLinkedLine` boolean preserves the pre-PR-G5.5.b semantic:
 * "this login was the moment the Customer acquired its LINE binding".
 * Used by the caller to gate `awardLineJoinReferrerIfEligible`
 * (referral points must NOT fire on already_synced / account_repaired).
 *
 * The `accountSyncStatus` field matches the values
 * `oauthAccountSyncStatusForExisting()` produces for the inline path —
 * the caller logs it on the success path (`oauth_linked_existing`).
 */

import { bindLineToExistingCustomerById } from "./bind-line-to-customer";
import {
  logLineBindEvent,
  type AccountSyncStatus,
  type LineBindEvent,
} from "@/lib/line-bind-log";

/**
 * Trusted wiring input from the auth.ts signIn callback. Caller is
 * responsible for guaranteeing:
 *
 *   - `storeId` has been resolved from a trusted source (the
 *     resolveStoreFromOAuthCookie path in auth.ts).
 *   - `customer.userId !== null` AND `provider === "line"` AND
 *     `customer.storeId === storeId` (the Case A lookup precondition
 *     already enforces these in auth.ts before this helper is invoked).
 *   - `lineUserId` came from a verified OAuth handshake AND equals
 *     `account.providerAccountId`.
 */
export interface AuthCaseALineBindInput {
  /** Trusted store context resolved by auth.ts before dispatch. */
  storeId: string;
  /** Customer.id from the Case A lookup (customer.userId !== null). */
  customerId: string;
  /** Verified LINE userId; must equal `account.providerAccountId`. */
  lineUserId: string;
  /**
   * `user.name ?? "顧客"` from the OAuth profile (matches auth.ts
   * inline baseline). Used as D3's `lineName` input which writes to
   * `Customer.lineName` via the conditional updateMany (truthy gate).
   */
  oauthName: string;
  /**
   * NextAuth `account` object (LINE provider). The helper synthesizes
   * D3's `oauthAccount` from this shape — `provider` is forced to "line"
   * and `providerAccountId` is forced to `lineUserId` (PR #243 Codex P2
   * round 17 canonical literals). Only `type` + the 6 token fields flow
   * through to the Account row.
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
 * Discriminated union result.
 *
 * `ok: true` → caller proceeds with post-tx best-effort
 * (awardLineJoinReferrerIfEligible gated on `justLinkedLine`,
 * repairCustomerIdentityOnLogin always, logLineBindEvent
 * `oauth_linked_existing` with `accountSyncStatus`).
 *
 * `ok: false` → caller short-circuits to `return false` from signIn.
 * Helper already emitted the structured `unexpected_error` log.
 */
export type AuthCaseALineBindResult =
  | {
      ok: true;
      /** customer.userId (returned for symmetry with G5.5.a helper shape). */
      userId: string;
      /**
       * True when THIS login is the moment Customer.lineUserId went
       * from null → set. Gates `awardLineJoinReferrerIfEligible` in
       * the caller (matches inline `justLinkedLine` semantic).
       */
      justLinkedLine: boolean;
      /**
       * For the `oauth_linked_existing` success log. Mirrors what the
       * inline path used to compute via
       * `oauthAccountSyncStatusForExisting()`.
       */
      accountSyncStatus: AccountSyncStatus;
    }
  | {
      ok: false;
      /**
       * Specific D3 rejection class, surfaced in the structured
       * `unexpected_error` log as `errorCode: "d3_<reason>"`. The
       * caller treats all `ok:false` outcomes identically (return
       * false from signIn).
       */
      reason:
        | "customer_locked"
        | "unique_conflict"
        | "write_conflict"
        | "stale_customer_link"
        | "store_mismatch"
        | "customer_has_no_user";
    };

/**
 * Wire the auth.ts Case A LINE branch to D3.
 *
 * Returns a discriminated union; NEVER throws on expected D3 outcomes.
 * (D3 itself can re-throw unrelated Prisma errors — the caller's outer
 * try/catch catches those and emits the legacy `unexpected_error` log
 * with `errorCode: error.name`. Preserves today's behaviour.)
 */
export async function bindLineCaseAForAuthSignIn(
  input: AuthCaseALineBindInput,
): Promise<AuthCaseALineBindResult> {
  const result = await bindLineToExistingCustomerById({
    storeId: input.storeId,
    customerId: input.customerId,
    lineUserId: input.lineUserId,
    // D3's `lineName` writes to Customer.lineName via the conditional
    // updateMany (truthy gate). auth.ts inline baseline used
    // `oauthName` (≡ user.name ?? "顧客") with the same truthy gate
    // (`if (oauthName && !customer.lineName)` — note the inline path
    // ALSO checked `!customer.lineName` to avoid overwriting an
    // existing display name; D3's runFullBindTx writes lineName as
    // part of the new bind, and runAccountOnlyRepairTx / already_synced
    // never touch Customer.lineName). For Case A, this is byte-equivalent
    // because the inline path only ever wrote lineName when
    // customer.lineUserId was null (≡ runFullBindTx path in D3).
    lineName: input.oauthName,
    // PR-G5.5.b stage 1: forward the 10-field OAuth bundle so D3's
    // tx.account.create writes the same Account row shape as the
    // pre-PR-G5.5.b auth.ts Case A inline path.
    oauthAccount: {
      // Canonical literals (PR #243 Codex P2 round 17). D3 itself
      // enforces these regardless of input — synthesizing them here
      // means the test layer sees the byte-equivalent intent.
      provider: "line",
      providerAccountId: input.lineUserId,
      type: input.account.type,
      access_token: input.account.access_token ?? null,
      refresh_token: input.account.refresh_token ?? null,
      id_token: input.account.id_token ?? null,
      expires_at: input.account.expires_at ?? null,
      scope: input.account.scope ?? null,
      token_type: input.account.token_type ?? null,
    },
  });

  // Map D3's 7 expected statuses to the wiring shape.
  switch (result.status) {
    case "bound_existing":
      // Full first-time bind: Customer.lineUserId was null → set;
      // Account[line] row created. `justLinkedLine: true` matches the
      // inline `if (!customer.lineUserId) { ...; justLinkedLine = true; }`
      // path; `accountSyncStatus: "created"` matches
      // `oauthAccountSyncStatusForExisting()` when accountCreated=true.
      return {
        ok: true,
        userId: result.userId,
        justLinkedLine: true,
        accountSyncStatus: "created",
      };
    case "customer_repaired":
      // Customer.lineUserId went from null → set inside the repair tx,
      // but the Account[line] row already existed for the same User
      // (legacy drift). From the customer's perspective, this login
      // is the moment they got their LINE binding → justLinkedLine:true.
      // Account.create did NOT run → accountSyncStatus
      // "noop_already_synced" (matches what the inline path would have
      // logged if it had encountered this state with the legacy
      // existingAccount.userId === customer.userId check).
      return {
        ok: true,
        userId: result.userId,
        justLinkedLine: true,
        accountSyncStatus: "noop_already_synced",
      };
    case "account_repaired":
      // Customer.lineUserId was ALREADY set to the same input.lineUserId;
      // only the missing Account[line] row was created via repair tx.
      // From the customer's perspective they were already linked — this
      // login is NOT the moment of binding. `justLinkedLine: false`
      // matches the inline path where `!customer.lineUserId` would have
      // been false (Customer.lineUserId already set).
      // accountSyncStatus "created" matches accountCreated=true semantics.
      return {
        ok: true,
        userId: result.userId,
        justLinkedLine: false,
        accountSyncStatus: "created",
      };
    case "already_synced":
      // Idempotent no-op: Customer.lineUserId already set AND
      // Account[line] already exists for same User. Nothing changed.
      // `justLinkedLine: false` (no new binding); accountSyncStatus
      // "noop_already_synced" matches inline behaviour.
      return {
        ok: true,
        userId: result.userId,
        justLinkedLine: false,
        accountSyncStatus: "noop_already_synced",
      };
    case "customer_locked":
    case "unique_conflict":
    case "write_conflict":
    case "stale_customer_link":
    case "store_mismatch":
    case "customer_has_no_user": {
      const reason = result.status;
      const evt: LineBindEvent = {
        path: "oauth-line-signin",
        status: "unexpected_error",
        storeId: input.storeId,
        lineUserId: input.lineUserId,
        customerId: input.customerId,
        errorCode: `d3_${reason}`,
      };
      logLineBindEvent(evt);
      return { ok: false, reason };
    }
  }
}
