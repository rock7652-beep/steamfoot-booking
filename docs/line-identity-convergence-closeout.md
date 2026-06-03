# LINE / LIFF identity convergence — closeout

**Status:** ✅ Complete · landed on `main` 2026-06-03 · 7 PRs merged
**Predecessor doc:** [`docs/line-identity-binding-pre-audit.md`](./line-identity-binding-pre-audit.md) (PR-G5.0)
**Companion doc:** [`docs/line-mismatch-repair-closeout.md`](./line-mismatch-repair-closeout.md) (historical drift cleanup PR-F2 series)
**Companion doc:** [`docs/identity-flow.md`](./identity-flow.md) (PR-2 era flow diagrams; partially superseded — see §5)

---

## 0. Read this if you're about to touch LINE OAuth, LIFF binding, or `auth.ts`

This document is the **single source of truth** for what the LINE identity system looks like after the PR-G5.x convergence series. Before you write or modify code that touches:

- `src/lib/auth.ts` signIn callback
- `src/server/services/bind-line-to-customer.ts` (the canonical helpers — D3 / D5)
- `src/server/actions/oauth-confirm.ts` (`resolveLineLogin` / `finalizeLineBind`)
- `src/app/(liff)/liff/onboarding/actions.ts` (LIFF Mini App onboarding)
- `Customer.lineUserId` / `Customer.lineName` / `Account[line]` rows
- Anything that creates or modifies a User row from a LINE OAuth or LIFF flow

…you MUST read §4 (auth.ts current state) and §5 (do-not-touch list) at minimum. Failure to read this doc will likely re-introduce the drift bugs PR-F1.2 audit and PR-F2 repair scripts have already cleaned up once.

---

## 1. Background — why we did this

### The pre-G5 problem

Before this convergence, the LINE identity write path was scattered across **7 separate sites** that all wrote some subset of `Customer.lineUserId` / `Account[line]` / `User`. The G5 series converged **4 of the 7**; the remaining 3 are intentionally left in their pre-G5 shape (see §5 / §7 for rationale + remaining drift profile):

| Site | What it wrote (pre-G5) | Pre-G5 atomic? | Post-G5 status |
|---|---|---|---|
| `auth.ts` signIn Case A (existing User) | `Account[line]` + `Customer.update(lineUserId/lineLinkStatus/lineLinkedAt/lineName)` | ❌ 2 loose writes | ✅ converged — routes through D3 atomic tx (PR #255) |
| `auth.ts` signIn Case B (no User on existing Customer) | `User.create` + `Account[line]` + `Customer.update` | ❌ 3 loose writes | ✅ converged — routes through D5 atomic tx (PR #254) |
| `auth.ts` signIn Case C (no Customer) | `User.create` + `Customer.create` + `Account[line]` | ✅ already in tx | ⏭ **NOT converged** — inline tx kept; signed-stage flow intentionally skipped (see §5) |
| LIFF onboarding action B4 (precreated Customer) | `User.create` + `Customer.update` + post-tx `syncLineAccountForUser` | ❌ 2 loose + post-tx | ✅ converged — routes through D5 atomic tx (PR #252) |
| LIFF onboarding action (0-candidate `created_new`) | tx{ `User.create` + `Customer.create` } + post-tx `syncLineAccountForUser` for Account | ⚠ tx + post-tx | ⏭ **NOT converged** — same shape today; `Customer-ahead / Account-behind` drift window remains (see §7 follow-ups) |
| oauth-confirm `finalizeLineBind` (post-password) | `Customer.update(lineUserId,...)` + post-tx `syncLineAccountForUser` | ❌ 1 + post-tx | ✅ converged — routes through D3 atomic tx (PR #250) |
| **webhook bind-code flow** (`/api/line/webhook` six-digit code) | `Customer.update` + post-tx `syncLineAccountForUser` | ❌ 1 + post-tx | ⏭ **NOT converged** — same shape today (`prisma.customer.update` at `src/app/api/line/webhook/route.ts:361` + post-tx `syncLineAccountForUser` at line 377); `Customer-ahead / Account-behind` drift window remains (see §7 follow-ups) |

Any failure between the loose writes left one of these drift states in production:

- **`needs_customer_merge`** — Customer.lineUserId set but Account[line] row owned by a different User
- **`Account-ahead Customer-behind`** — Account[line] exists but Customer.lineUserId is null (the binding never reached Customer)
- **`Customer-ahead Account-behind`** — Customer.lineUserId set but Account[line] missing (the syncLineAccountForUser post-tx step failed silently)
- **Orphan User** — `User.create` succeeded but `Customer.update` / `Customer.create` / `Account.create` failed and was never retried
- **Half-updated Customer** — `lineUserId` was set without `lineLinkStatus` / `lineLinkedAt`, or vice versa

These drift patterns were what the **PR-F1.2 audit script** discovered and what the **PR-F2 / PR-F2.1 / PR-F2.2 repair scripts** cleaned up by hand against production. See `docs/line-mismatch-repair-closeout.md` for the historical narrative.

### Why this needed structural fix, not just more repair

Each repair PR found **new** drift cases that the prior round missed. The bugs were generated continuously by the loose-write paths above. Cleaning up the existing rows without fixing the generators would have been an infinite loop.

The G5 series stops the generators **on the converged 4 sites** (auth.ts Case A LINE / auth.ts Case B LINE / oauth-confirm `finalizeLineBind` / LIFF onboarding B4 precreated activation). The remaining 3 sites — `auth.ts` Case C inline (already atomic, no drift to stop), LIFF 0-candidate `created_new` (post-tx `syncLineAccountForUser` for Account), and webhook bind-code (`prisma.customer.update` + post-tx sync) — are **NOT** converged by this series. The two non-atomic of those (LIFF 0-candidate + webhook) can still produce `Customer-ahead / Account-behind` drift when their post-tx Account sync fails; see §7 "Open convergence follow-ups" for the precise remaining drift profile and suggested convergence targets. Do NOT read this doc as "all LINE drift sources have been eliminated" — read it as "the main OAuth signIn paths have been converged; two bounded follow-ups remain documented."

---

## 2. PR series — what landed

All PRs are on `main`. None reverted.

| PR | Label | Scope | Merged commit |
|---|---|---|---|
| **#226** | PR-G5.0 | Pre-audit doc landing (`docs/line-identity-binding-pre-audit.md`) | (pre-G5 baseline) |
| **#242** | PR-G5.1.a | Add `bindLineToExistingCustomerById` (D3) canonical helper — Serializable atomic Customer.update + Account.create, 7-status discriminated union | (helper-only; dead code until G5.2.a) |
| **#243** | PR-G5.1.b | Add `activatePrecreatedCustomerWithLine` (D5) canonical helper — byte-equivalent refactor target for auth.ts Case B + LIFF B4; atomic User+Account+Customer in one tx | (helper-only; dead code until G5.2.b / G5.5.a) |
| **#249** | PR-G5.1.c | HMAC-SHA256 signing for `oauth_line_session` cookies (90s TTL); `/api/oauth-line-stage` route; `signStageToken` / `verifyStageToken` helpers | (infra-only; no auth.ts consumer yet — see §5) |
| **#250** | PR-G5.2.a | Wire `oauth-confirm finalizeLineBind` → D3 (NEED_LOGIN finalize path now atomic) | `67df4a3` |
| **#252** | PR-G5.2.b | Wire LIFF onboarding B4 branch (precreated Customer) → D5; added round-2 atomic `customerNameOverride` rollback semantic | `f760217` |
| **#254** | PR-G5.5.a | Wire `auth.ts` Case B LINE branch → D5 | `8918b97` |
| **#255** | PR-G5.5.b | Extend D3 with optional 10-field `oauthAccount` input; wire `auth.ts` Case A LINE branch → D3; Codex P2 round-1 `customer.lineName` preservation fix | `4aee4b1` |

---

## 3. Canonical helpers

There are exactly **two** canonical helpers for LINE binding writes. ALL new LINE-binding code should call one of these. **Do not write `prisma.account.create` / `prisma.customer.update(lineUserId,...)` inline ever again** — that's how we got into the F1.2 mess.

### D3 — `bindLineToExistingCustomerById`

**File:** `src/server/services/bind-line-to-customer.ts` (search for `export async function bindLineToExistingCustomerById`)

**When to use:** Customer **already exists** AND `Customer.userId !== null` (the customer has a User row). You want to attach LINE to them without creating a new User.

**Input:**
```ts
{
  storeId: string;
  customerId: string;
  lineUserId: string;
  lineName: string | null;
  oauthAccount?: {                // PR-G5.5.b: optional 10-field OAuth bundle
    provider: string;             //   When set → tx.account.create writes 10 fields
    providerAccountId: string;    //   When unset → 4-field minimal (oauth-confirm baseline)
    type: string;
    access_token: string | null | undefined;
    refresh_token: string | null | undefined;
    id_token: string | null | undefined;
    expires_at: number | null | undefined;
    scope: string | null | undefined;
    token_type: string | null | undefined;
  };
}
```

**Returns** (discriminated union — never throws on expected branches):
- `bound_existing` — full first-time bind: Customer.lineUserId null → set; Account[line] created in Serializable tx
- `customer_repaired` — Customer.lineUserId went null → set; Account[line] already existed for same User (drift state cleanup)
- `account_repaired` — Customer.lineUserId was already set to this lineUserId; Account[line] was missing and now created (drift state cleanup)
- `already_synced` — both Customer.lineUserId AND Account[line] already aligned for same User; idempotent no-op, 0 DB writes
- `customer_locked` — different LINE bound on Customer OR Account[line] owned by different User; **refused, 0 writes** (see §6 anti-hijack)
- `unique_conflict` (Prisma P2002) — race; rolled back, 0 partial state
- `write_conflict` (Prisma P2034) — Serializable retry exhausted; rolled back, 0 partial state
- `stale_customer_link` — in-tx CAS race lost (Customer state changed between preflight and tx); rolled back
- `store_mismatch` — authorization boundary failed
- `customer_has_no_user` — caller misuse (D3 requires existing User)

**Consumers (post-G5):**
- `oauth-confirm.ts` `finalizeLineBind` — wired in PR-G5.2.a (no `oauthAccount` → 4-field minimal Account, baseline byte-equivalent)
- `auth.ts` Case A LINE branch — wired in PR-G5.5.b (via `src/server/services/auth-case-a-line-bind.ts` adapter; passes `oauthAccount` → 10-field full Account, baseline byte-equivalent)

**Explicit NON-consumers (still legacy `customer.update + post-tx syncLineAccountForUser`):**
- `webhook bind-code` flow at `src/app/api/line/webhook/route.ts` — see §1 table footnote + §5 + §7. **D3 conversion is an open follow-up.** Do NOT assume webhook is D3-atomic when scoping future identity / drift work.

### D5 — `activatePrecreatedCustomerWithLine`

**File:** `src/server/services/bind-line-to-customer.ts` (search for `export async function activatePrecreatedCustomerWithLine`)

**When to use:** Customer **already exists** AND `Customer.userId === null` (staff-precreated row that hasn't been activated yet). LINE first-login by the customer; you need to create the User + Account + link Customer in one atomic step.

**Input:**
```ts
{
  storeId: string;
  customerId: string;
  lineUserId: string;
  lineName: string | null;
  oauthProfile: { email, image, name };           // all nullable
  oauthAccount: { 10 fields incl. OAuth tokens }; // required (D5 always writes 10 fields)
  customerNameOverride?: string;                  // PR-G5.2.b round 2: optional atomic Customer.name rewrite
}
```

**Returns** (discriminated union — never throws on expected branches):
- `activated` — User + Account[line] + Customer link metadata all written atomically in one Serializable tx
- `customer_already_has_user` — caller misuse (Customer.userId !== null → should route to D3)
- `customer_already_linked_to_other_line` — Customer.lineUserId already set to a different LINE; refused
- `stale_customer_link` — in-tx CAS lost race (concurrent activation / merge)
- `store_mismatch` — authorization boundary failed
- `unique_conflict` / `write_conflict` — Prisma P2002 / P2034 rolled back
- `line_account_mismatch` — caller's `oauthAccount.provider !== "line"` or `providerAccountId !== lineUserId`; refused without DB I/O

**Consumers (post-G5):**
- LIFF onboarding action B4 branch — wired in PR-G5.2.b (passes `customerNameOverride: input.name` for atomic name override)
- `auth.ts` Case B LINE branch — wired in PR-G5.5.a (via `src/server/services/auth-case-b-line-activation.ts` adapter; does NOT pass `customerNameOverride` → preserves byte-equivalent baseline that doesn't rewrite Customer.name)

### Atomicity contract (both helpers)

- All multi-row writes happen inside `prisma.$transaction({}, { isolationLevel: "Serializable" })`
- Any failure → atomic rollback → **zero partial state** is observable
- Discriminated-union returns mean callers never need to interpret raw Prisma errors; the helpers translate `P2002` / `P2034` / their own sentinels into typed statuses
- PII (lineUserId / customerId / userId / phone / email) is masked in all internal `console.warn` log lines via `maskLineUserId` / `maskId` from `src/lib/line-bind-log.ts`

---

## 4. `auth.ts` LINE-provider signIn callback — current state

`src/lib/auth.ts` lines ~400-870 contain the NextAuth v5 `signIn` callback. The LINE-provider path (after store-context resolution and Customer lookup) dispatches into 3 cases:

### Case A — `customer?.userId` (existing Customer with existing User)

**Trigger:** Returning customer logs in via LINE OAuth. Already has both Customer and User rows.

**Post-G5.5.b flow:**
```
LINE branch → src/server/services/auth-case-a-line-bind.ts → D3
                                                              ↓
                       maps D3's 7 success/rejection statuses → {ok, userId, justLinkedLine, accountSyncStatus}
                                                              ↓
                       caller (auth.ts) runs post-tx best-effort if ok:
                         - awardLineJoinReferrerIfEligible (gated on justLinkedLine)
                         - repairCustomerIdentityOnLogin
                         - logLineBindEvent(oauth_linked_existing, accountSyncStatus)

Google branch → existing inline 2-write path (unchanged; D3 is LINE-only)
```

**`justLinkedLine` semantics** (preserved byte-equivalent vs pre-G5.5.b):
- `bound_existing` → `true` (full first-time bind)
- `customer_repaired` → `true` (Customer.lineUserId went null → set this run)
- `account_repaired` → `false` (Customer was already LINE-linked; just adding missing Account row — NOT a fresh binding)
- `already_synced` → `false` (nothing changed — must NOT fire referral / log as new bind)

**`customer.lineName` preservation** (PR-G5.5.b Codex P2 round 1 fix):
The wiring helper computes `lineNameForBind = customerLineName || oauthName || null` so existing staff-entered / dashboard-edited LINE display names are never overwritten by OAuth display name on subsequent logins. See test file `src/__tests__/auth-case-a-line-bind.test.ts` "Codex P2: preserve existing Customer.lineName" describe block.

### Case B — `customer && !customer.userId` (staff-precreated Customer, no User)

**Trigger:** Staff created a Customer row in the back-office; the customer is doing their first LINE OAuth login.

**Post-G5.5.a flow:**
```
LINE branch → src/server/services/auth-case-b-line-activation.ts → D5
                                                                    ↓
                       maps D5's 7 statuses → {ok, userId} or {ok:false, reason}
                                                                    ↓
                       caller runs post-tx best-effort if ok:
                         - awardLineJoinReferrerIfEligible (justLinkedLine always true for Case B)
                         - repairCustomerIdentityOnLogin
                         - logLineBindEvent(oauth_created_user_for_customer)

Google branch → existing inline 3-write path (unchanged; D5 is LINE-only)
```

**Byte-equivalent baseline** (preserved per D5's PR-G5.1.b §1597 contract):
- `customerNameOverride` is INTENTIONALLY NOT passed → D5 reads in-tx Customer.name as User.name source AND omits Customer.name from updateMany.data (no rewrite). Matches pre-G5.5.a inline behaviour bit-for-bit. (This contrasts with the LIFF onboarding B4 caller which DOES pass `customerNameOverride: input.name` for the "未命名" staff placeholder UX.)

### Case C — no Customer found (first-ever LINE login by an unknown phone)

**Trigger:** No Customer matches `(storeId, lineUserId)`, `googleId`, or `(email, storeId)`. This is a true new identity.

**Post-G5 flow:**
```
Inline prisma.$transaction (UNCHANGED — already atomic):
  tx.user.create + tx.customer.create (with _oauth_line_<last8> placeholder phone)
                 + tx.account.create (10 fields incl. OAuth tokens)

Post-tx best-effort (UNCHANGED):
  bindReferralToCustomer (pending-ref cookie)
  awardLineJoinReferrerIfEligible
  repairCustomerIdentityOnLogin
  logLineBindEvent(oauth_created_all)
```

**Why Case C was NOT routed through the signed-stage flow:**
Reverting to the PR-2 stage flow (redirect → `/oauth-confirm` → user enters phone → finalize) was **explicitly rejected** per the comment block at `auth.ts:705-720` ("PR-2 stage flow 已撤" — original notes are right there in the source). The rejection rationale:
- Sending users to `/oauth-confirm` after LINE OAuth caused drop-off
- Users who bailed left orphan User rows
- The post-tx merge cost (when the same human turns out to have a non-LINE Customer with same phone) is operationally acceptable per the existing back-office merge UI

The PR-G5.1.c signed-stage infrastructure (`signStageToken` + `verifyStageToken` + `/api/oauth-line-stage`) **does exist as code** but is **DORMANT in production today** — `signStageToken` has zero production callers (only its own definition file in `src/lib/oauth-stage-token.ts` references it; the only other references are in test files). The `/api/oauth-line-stage` route handler exists and is reachable by HTTP, but nothing in the live code path produces a stage token to feed it. The infrastructure was shipped in anticipation of a future Case C UX gating decision; the decision to actually wire it has been **deferred** (see §5 for the rationale).

> ⚠ Do NOT describe `/api/oauth-line-stage` as part of the active oauth-confirm / password-finalize chain — it is not. The oauth-confirm `finalize` page (PR-G5.2.a's D3 wiring) is reached via a NextAuth `signIn("customer-phone", { redirectTo: "/oauth-confirm/finalize" })` redirect after password authentication — that path does NOT go through `/api/oauth-line-stage`.

---

## 5. Do NOT touch — explicit guards

This list is enforced by convention, code review, and (where possible) test sentinels. If you have a reason to violate any of these, **stop and open a design discussion first** — the rationale below is load-bearing.

### Do NOT re-open Case C signed-stage flow

- **What:** Don't make `auth.ts` Case C redirect to `/oauth-confirm` for phone collection
- **Why:** Explicitly rejected per `auth.ts:705-720` — caused orphan Users + drop-off. Tracked as a separate initiative (PR-G5.6, future) ONLY if the UX team decides the merge cost is worse than the friction cost.
- **Today's behavior:** Case C creates User+Customer+Account inline atomically with `_oauth_line_<last8>` placeholder phone. Operators handle dedup via back-office merge UI when a real phone arrives later.

### Do NOT activate `/api/oauth-line-stage` from `auth.ts` (or anywhere else)

- **What:** `auth.ts` signIn callback (or any other production code) must NOT call `signStageToken()` and redirect to `/api/oauth-line-stage`
- **Why:** Same rationale as above — that's how you'd re-open Case C signed-stage. The infra exists for a future explicit decision, not for casual reuse.
- **Today's consumer count: ZERO.** `signStageToken` has no production callers (verified — only its own definition file in `src/lib/oauth-stage-token.ts` references it; test files exercise it but never run in prod). The `/api/oauth-line-stage` route handler exists but is **dormant** — no production code path produces a stage token to feed it. The route can be reached by direct HTTP, but a missing/invalid `t` parameter just redirects to `/oauth-confirm` with no cookie set (which then shows "session 已過期"). It is harmless dormant infra, not an active surface.

### Do NOT change oauth-confirm behavior

- **What:** `src/server/actions/oauth-confirm.ts` `resolveLineLogin` / `finalizeLineBind` / `oauthConfirmLoginAction`
- **Why:** This is the canonical NEED_LOGIN / BLOCKED_NEEDS_STAFF gating surface. It's already wired to D3 (PR-G5.2.a). Modifying it risks regressing the "phone+password gate before LINE binding" anti-hijack invariant from `docs/identity-flow.md` §3 Step 0.
- **Tests guarding this:** `src/__tests__/oauth-confirm.test.ts` (23 tests covering all 4 status branches + the Step-0 anti-transfer guard).

### Do NOT touch the Google branch (any Case)

- **What:** Don't extend D3/D5 to be provider-agnostic; don't wire `auth.ts` Google paths to them
- **Why:** D3 + D5 hardcode `provider: "line"` + `providerAccountId: input.lineUserId` as canonical literals (PR #243 Codex P2 round 17 enforces this). A Google convergence would need a sibling Google-flavored helper (out of scope for the LINE identity series).
- **Today's Google paths:** Cases A + B + C all keep their existing inline writes. They had the same atomicity problems LINE had, but Google traffic is lower-volume so the drift impact is bounded. A separate `PR-G6.x` series would be the right place if convergence is wanted.

### Do NOT modify D3 / D5 main logic in feature PRs

- **What:** Don't change `bindLineToExistingCustomerById` / `activatePrecreatedCustomerWithLine` main dispatch, the 5-step routing, or step 5.6 drift detection
- **Why:** These helpers have heavy test coverage (167 D3 tests + 205 D5 tests + byte-equivalent contracts vs auth.ts baseline). Codex's static-shape regression tests (8 source-structure regexes in D5's test file alone) will fail if internal layout changes.
- **Allowed:** Adding new optional input fields (mirror the PR-G5.5.b `oauthAccount` extension pattern: optional → unset = old behavior, set = new behavior) IF carefully designed to preserve all existing callers byte-equivalent.

### Do NOT touch the LIFF onboarding action

- **What:** `src/app/(liff)/liff/onboarding/actions.ts` — the LIFF Mini App's first-login handler
- **Why:** It's the canonical write-point for LIFF-side bindings. Wired through `bindLineToCustomerInStore` which dispatches to D5 (B4 branch) per PR-G5.2.b. Modifying it risks regressing the customer-merge / phone-hijack guards.
- **Tests guarding this:** `src/__tests__/liff-onboarding-action.test.ts`.

### Do NOT touch webhook bind-code flow (without explicit follow-up PR)

- **What:** `/api/line/webhook` bind-code path (six-digit code redemption at `src/app/api/line/webhook/route.ts:250+`)
- **Why:** Independent identity-binding surface with its own anti-hijack guards (bind-code single-use, expiry, cross-store rejection).
- **⚠ IMPORTANT — STILL LEGACY:** This path is **NOT a D3 caller** despite being a LINE-binding write site. The current implementation (verified at `src/app/api/line/webhook/route.ts:361-385`) is:
    ```
    prisma.customer.update({lineUserId, lineLinkStatus, lineLinkedAt})  // ← loose write
    + (if customer.userId set) syncLineAccountForUser({userId, lineUserId})  // ← post-tx best-effort
    ```
    This is the exact non-atomic `customer.update + post-tx sync` pattern the G5 series replaced everywhere else. The webhook path **retains the `Customer-ahead / Account-behind` drift window** — if `Customer.update` succeeds but the post-tx `syncLineAccountForUser` fails, the system is left with `Customer.lineUserId` set but `Account[line]` missing. This is the same shape as pre-G5 oauth-confirm `finalizeLineBind` had before PR-G5.2.a.
- **Why NOT converged in the G5 series:** Webhook traffic is bounded (six-digit-code redemptions only happen when staff hands out a code) and the existing PR-F1.2 audit + PR-F2 repair tooling cleans up any residual drift safely. Convergence is a clear win but lower priority than the OAuth flows.
- **Convergence is an OPEN follow-up:** See §7. Tests in `src/__tests__/diagnose-line-identity-drift.test.ts` and adjacent.

### Do NOT touch schema / migrations / DB / env

- **What:** No `prisma/schema.prisma` edits; no new migration files; no `.env` keys
- **Why:** The G5 series shipped zero schema changes. Adding columns or constraints now would be a SEPARATE design decision. The end-state DB shapes are already documented in the helpers' doc-comments.

### Do NOT touch `package.json` / lockfile / `next.config` / proxy / store-resolver

- **What:** Build / dependency / routing configuration
- **Why:** Out of scope; risks unrelated regressions. If you need a new dep, that's its own PR.

### Do NOT touch Rich Menu / LIFF UI (without separate PR)

- **What:** LINE OA Rich Menu configuration; LIFF page UI
- **Why:** These are UX surfaces that compose on top of the identity layer. Convergence work is the layer below. UI changes belong in their own PRs with their own design + smoke plans.

---

## 6. Safety invariants — must hold across all callers

These are the rules that the test suite enforces and that future changes MUST preserve.

### §6.1 Anti-hijack: B3 phone match without LINE binding → refusal

**Rule:** If LIFF onboarding (or any auto-bind flow) finds an existing Customer with `Customer.userId !== null` AND `Customer.lineUserId === null`, the system MUST refuse to auto-bind LINE to that Customer.

**Why:** Phone numbers are guessable. If we auto-bound LINE to any Customer-by-phone match, an attacker could claim someone else's identity just by knowing their phone.

**Where enforced:**
- LIFF onboarding action → `bindLineToCustomerInStore` B3 branch → returns `phone_taken_by_other_user` (NOT routed through D3)
- This is the explicit reason LIFF onboarding does NOT call D3 for B3 — even though D3 supports the case, calling it from LIFF would be a §7.1 violation
- oauth-confirm `resolveLineLogin` Step 1 → if Customer is "activated" (has passwordHash OR has OAuth Account), routes to NEED_LOGIN (password gate) — same intent

**Test sentinel:** `src/__tests__/bind-line-to-customer.test.ts` "phone_taken_by_other_user" describe block.

### §6.2 `Customer.lineName` preservation

**Rule:** When a Customer already has a non-empty `Customer.lineName` value, LINE OAuth login MUST NOT overwrite it with the OAuth display name. Staff-entered / dashboard-edited names take precedence.

**Where enforced:**
- `auth.ts` Case A: via `src/server/services/auth-case-a-line-bind.ts` `lineNameForBind = customerLineName || oauthName || null` computation (PR-G5.5.b Codex P2 round 1)
- D5 (LIFF / Case B activation): via `customerNameOverride` truthy-gate in `buildActivationCustomerUpdateData`; auth.ts Case B explicitly omits the override → baseline preserved; LIFF B4 sets it intentionally when the staff placeholder differs

**Test sentinel:** `src/__tests__/auth-case-a-line-bind.test.ts` "Codex P2: preserve existing Customer.lineName" describe block (5-row coverage matrix).

### §6.3 D3 OAuth tokens preservation

**Rule:** When a caller has full OAuth tokens (auth.ts Case A), D3 MUST write all 10 Account fields including tokens. When a caller doesn't (oauth-confirm finalize), D3 writes the 4-field minimal row. Neither caller should silently lose data.

> Note: webhook bind-code is NOT in this list — it's not a D3 caller at all today (see §3 NON-consumers + §5 + §7).

**Where enforced:**
- `bindLineToExistingCustomerById` input has optional `oauthAccount?: {10 fields}` (PR-G5.5.b stage 1)
- `buildAccountCreateDataForExistingCustomerBind` is the single source of truth — both `runFullBindTx` and `runAccountOnlyRepairTx` route Account.create data construction through it
- Canonical literals: `provider: "line"` + `providerAccountId: input.lineUserId` are HARDCODED regardless of caller input (the caller's `oauthAccount.provider` / `providerAccountId` fields are IGNORED — defensive contract)

**Test sentinel:** `src/__tests__/bind-line-to-existing-customer-by-id.test.ts` "PR-G5.5.b: optional oauthAccount input" describe block (8 tests including 2 explicit REGRESSION GUARDS for the 4-field minimal shape).

### §6.4 `already_synced` must not fire fresh-link side effects

**Rule:** When D3 returns `already_synced` (or `account_repaired`), the caller MUST NOT fire `awardLineJoinReferrerIfEligible`, MUST NOT log a "newly linked" event, MUST NOT treat the login as a fresh binding. These outcomes mean the customer's binding state is unchanged from before the request.

**Why:** Referral point awards are deduped by `sourceKey` at the DB layer, but firing them on every login would create unnecessary audit-log noise AND risk re-firing if dedup ever fails.

**Where enforced:**
- `auth.ts` Case A: `justLinkedLine` boolean derived from D3 status; only `bound_existing` + `customer_repaired` set it true. `account_repaired` + `already_synced` keep it false.
- Helper-level test sentinel: `src/__tests__/auth-case-a-line-bind.test.ts` explicitly asserts `justLinkedLine: false` for `already_synced` and `account_repaired` in the "D3 success status mapping" describe block.

### §6.5 Cross-user `Account[line]` collision → `customer_locked` controlled failure

**Rule:** If `Account[line, providerAccountId=lineUserId]` exists but is owned by a different User than `Customer.userId`, the binding MUST be refused via D3's `customer_locked` status. Auth.ts callers MUST translate this to a clean signin failure (return false), NOT silent partial drift.

**Why:** Pre-G5.5.b, `auth.ts` Case A silently skipped Account.create on cross-user collision but STILL updated Customer.lineUserId → instant drift state. Post-G5.5.b, D3's step 5a-ii / step 5.6-b detects this and refuses; the wiring helper logs `unexpected_error` with `errorCode: d3_customer_locked` and returns `ok:false`.

**Where enforced:**
- D3 main dispatch step 5a-ii (same lineUserId on Customer, different userId on Account)
- D3 main dispatch step 5.6-b (Customer.lineUserId null, Account[line] owned by different user)
- Test sentinel: `src/__tests__/auth-case-a-line-bind.test.ts` "customer_locked is the DEFENSIBLE TIGHTENING vs pre-PR-G5.5.b inline path" test.

### §6.6 Atomic Customer.name override (LIFF only)

**Rule:** LIFF onboarding's B4 path may overwrite `Customer.name` (replacing a "未命名" staff placeholder with the LIFF input name). When it does, the name write MUST happen INSIDE D5's Serializable tx — so a tx failure rolls back the name change atomically with the rest. **No outer pre-update is allowed.**

**Where enforced:** PR-G5.2.b round 2 (Codex P2). The LIFF caller passes `customerNameOverride: input.name`; D5's `buildActivationCustomerUpdateData` adds `name: <override>` to the in-tx `updateMany.data` only when the override differs from the in-tx snapshot. On any failure → Serializable rollback → Customer.name unchanged.

**auth.ts Case B does NOT use this** — it never passes `customerNameOverride`, so the baseline behavior of "don't rewrite Customer.name" is preserved bit-for-bit.

**Test sentinel:** `src/__tests__/bind-line-to-customer.test.ts` "PR-G5.2.b round 2: Customer.name pre-update is NEVER attempted before D5" describe block (6 atomic-guard tests sweeping every D5 rejection path).

### §6.7 PII masking in logs

**Rule:** Raw `lineUserId` / `customerId` / `userId` / `phone` / `email` MUST NOT appear in `console.warn` / `console.error` / `logLineBindEvent` payloads. Use `maskLineUserId` / `maskId` / `maskPhone` from `src/lib/line-bind-log.ts`.

**Where enforced:** Throughout `bind-line-to-customer.ts`, `auth-case-a-line-bind.ts`, `auth-case-b-line-activation.ts`, `oauth-confirm.ts`. The `logLineBindEvent` helper masks on its way out — callers can pass raw IDs to it.

**Test sentinel:** Multiple — every test file that exercises a log-emitting branch asserts on masked output shapes.

---

## 7. What can now be built on top

The **main LINE OAuth identity-binding paths** are converged (auth.ts Case A LINE / auth.ts Case B LINE / oauth-confirm `finalizeLineBind` / LIFF B4 precreated activation — all 4 atomic). Feature work that depends on knowing "who is the customer" can build on the post-G5 invariants without re-implementing identity resolution.

The webhook bind-code path and LIFF 0-candidate `created_new` path are **known remaining non-converged surfaces** (see "Open convergence follow-ups" below for their drift profile). They are bounded enough that the features in this section can be built today without waiting for those to land — but future identity-related audit work MUST account for them, not assume they're already covered.

### Ready to build

- **LIFF Mini App "我的預約"** (my bookings) — relies on `Customer.userId` being set; post-G5 guarantees it's set atomically with `Customer.lineUserId`
- **LIFF Mini App "剩餘堂數"** (remaining sessions) — same identity dependency
- **LIFF Mini App "立即預約" / "體驗預約"** (booking flows) — same
- **LINE 綁定狀態顯示** in customer-facing UI — read `Customer.lineUserId` + `Customer.lineLinkStatus`; both are now guaranteed-consistent
- **HealthFlow AI / 量身紀錄整合** — `Customer.id` is a stable join key (post-G5 OAuth paths atomically commit `Customer.userId` + `Customer.lineUserId` together for the converged sites); cross-app linking via `Customer.id` is safe
- **多店 LIFF 複製** (new stores onboarding to LIFF) — copy the LIFF onboarding action's wiring as-is; D3/D5 are store-scoped via `storeId` parameter

### Audit before building

- **Rich Menu actions** that need authenticated context — verify each action's entry point routes through the proper authenticated layer (LIFF token verify or OAuth signIn); don't add new identity write paths
- **AI 客服** message handlers that need to identify the customer — use existing `resolveStoreFromOAuthCookie` / `getOAuthTempSession` helpers; don't write `Customer.lineUserId` from message handlers

### Out of scope until separate design

- Cross-store identity (one human, multiple stores) — currently each store has its own Customer row; merging is a back-office decision, not an automated identity-layer concern
- Google convergence — see §5 "Do NOT touch the Google branch"
- Case C signed-stage flow — see §5 "Do NOT re-open Case C signed-stage flow"

### Open convergence follow-ups (NOT covered by the G5 series)

These two LINE-binding write sites still use the pre-G5 `customer.update + post-tx syncLineAccountForUser` pattern and retain the `Customer-ahead / Account-behind` drift window. They are intentionally LEFT alone by the G5 series for the reasons noted.

**Their convergence stories are different, NOT interchangeable** — they need different helpers because their preconditions differ:

- **Webhook bind-code** writes against an **existing Customer with an existing User** (the staff-issued bind code is redeemed by a Customer who is already activated). This shape FITS D3 (`bindLineToExistingCustomerById`), which requires `Customer.userId !== null`. A future PR could wire it through D3 (with `oauthAccount` unset → 4-field minimal Account, matching `finalizeLineBind` byte-equivalent baseline) — small wiring PR analogous to PR-G5.2.a.
- **LIFF onboarding 0-candidate `created_new`** runs when **NO Customer exists yet** (the LIFF first-login presents a never-seen-before phone). This shape does **NOT** fit D3 — D3 requires an existing Customer + User. It does not fit D5 either (D5 is "existing Customer, no User"). Convergence would need a **new D6-style create-and-bind helper** for the no-Customer case: atomic User + Customer + Account[line] write inside a single Serializable transaction (similar pattern to D5 but creating the Customer row from scratch instead of activating an existing one). Larger design effort than the webhook case.

| Site | File | Current pattern | Drift window | Suggested converge target |
|---|---|---|---|---|
| Webhook bind-code | `src/app/api/line/webhook/route.ts:361-385` | `prisma.customer.update + post-tx syncLineAccountForUser` | `Customer-ahead / Account-behind` if post-tx sync fails | **D3** (existing-customer helper; no `oauthAccount` since webhook has no OAuth tokens) — small wiring PR analogous to PR-G5.2.a |
| LIFF onboarding 0-candidate `created_new` | `src/server/services/bind-line-to-customer.ts` (`bindLineToCustomerInStore` 0-candidate branch) | `tx{user.create + customer.create} + post-tx syncLineAccountForUser` for Account | `Customer-ahead / Account-behind` if post-tx sync fails | **New D6-style helper** for "atomic User + Customer + Account[line] creation when no Customer exists" — NOT D3 (which requires existing User); larger design effort than the webhook case |

> ⚠ Do NOT assume both sites can be routed through D3. Only webhook fits D3's existing-customer precondition. LIFF 0-candidate needs a new helper.

**Doing nothing about these is acceptable today** — webhook traffic is bounded by staff handing out codes, and LIFF 0-candidate fires once per new customer ever. PR-F1.2 audit + PR-F2 repair tooling already exists for cleaning up any residual drift. Convergence would be a clear quality win when bandwidth allows, but is not a blocker for any of the §7 ready-to-build features.

---

## 8. Test coverage summary

After the G5 series, the LINE identity surface has the following test counts:

| Test file | Test count | What it guards |
|---|---|---|
| `bind-line-to-customer.test.ts` | 43 | LIFF onboarding action (`bindLineToCustomerInStore`) — 7 branches (A / B1 / B2 / B3 / B4 / B5 / C) + ambiguous + atomic guards |
| `bind-line-to-existing-customer-by-id.test.ts` | 167 | D3 helper — all 10 statuses + atomicity + drift repair + oauthAccount extension + structural-invariant regressions |
| `activate-precreated-customer-with-line.test.ts` | 205 | D5 helper — byte-equivalent baseline vs auth.ts Case B + atomic name override + 8 PII / structural regressions |
| `auth-case-a-line-bind.test.ts` | 26 | auth.ts Case A wiring — input shape + 4 success mappings + 6 rejection mappings + 5-row lineName preservation matrix + customer_locked tightening |
| `auth-case-b-line-activation.test.ts` | 15 | auth.ts Case B wiring — input shape + 7 D5 status mappings + byte-equivalent anchor (no customerNameOverride) |
| `oauth-confirm.test.ts` | 23 | oauth-confirm `resolveLineLogin` + `finalizeLineBind` (D3 wiring) + 4 status branches + Step-0 anti-transfer |
| `liff-onboarding-action.test.ts` | varies | LIFF onboarding entry point |
| `auth-line-customer-resolve.test.ts` | varies | `resolveCustomerForUser` (LINE-aware customer resolution for already-authed users) |

Full vitest baseline (as of PR #255 merge): **1746 pass**, 3 pre-existing failures unrelated to LINE identity (`store-context.test.ts` ×1 + `trial-correct-collection.test.ts` ×2).

---

## 9. Rollback story

Each G5 PR is independently revertable via `git revert`. There is **zero schema dependency** — no migrations to undo, no DB shape changes. The helpers (D3 / D5) shipped as helper-only / tests-only dead code first, then wiring PRs activated them. Reverting any wiring PR returns that surface to its pre-G5 inline behavior (with the documented atomicity bug) — same risk profile as pre-G5 prod.

If a runtime regression appears that requires a full rollback of the LINE identity convergence, the rollback order is the inverse of the merge order:

1. Revert #255 → auth.ts Case A LINE falls back to inline 2-write
2. Revert #254 → auth.ts Case B LINE falls back to inline 3-write
3. Revert #252 → LIFF onboarding B4 falls back to inline tx + post-tx sync
4. Revert #250 → oauth-confirm finalizeLineBind falls back to non-atomic customer.update + post-tx sync
5. Revert #249 → oauth temp-session cookies become unsigned (HMAC removed)
6. Revert #243 → D5 helper removed
7. Revert #242 → D3 helper removed

Steps 1-4 can be reverted independently (each is a wiring change). Steps 5-7 are pure removal (the helpers are not consumed by anyone else after the wiring reverts). Each step is `git revert` only.

---

## 10. Cross-reference

- **Pre-audit doc** (the design that informed this series): [`docs/line-identity-binding-pre-audit.md`](./line-identity-binding-pre-audit.md)
- **Historical drift repair** (what this series prevents from happening again): [`docs/line-mismatch-repair-closeout.md`](./line-mismatch-repair-closeout.md)
- **PR-2 era flow diagrams** (partially superseded — the stage-flow sections are now historical only): [`docs/identity-flow.md`](./identity-flow.md)
- **LIFF setup operational notes**: [`docs/liff-setup.md`](./liff-setup.md)
- **LIFF Mini App roadmap**: [`docs/line-mini-app-plan.md`](./line-mini-app-plan.md)
- **Internal LIFF testing SOP**: [`docs/liff-internal-testing-sop.md`](./liff-internal-testing-sop.md)
