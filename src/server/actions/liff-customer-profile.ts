"use server";

/**
 * fetchLiffCustomerProfile — LIFF 顧客「我的資料」server action (PR-LIFF-profile)
 *
 * Read-only projection of the current customer's basic profile + LINE binding
 * status + store display name. Designed for the `/s/{slug}/liff/profile` page.
 *
 * Design contract (mirrors liff-my-bookings.ts / liff-my-wallets.ts):
 *   1. CUSTOMER role only — staff should not see customer-facing profile
 *      view via LIFF.
 *   2. Does NOT accept any client-supplied `customerId` / `storeId` / etc. —
 *      all identity resolved via `requireSession` + `getCanonicalCustomerIdForSession`.
 *   3. `storeId` comes from `user.storeId` (written by LIFF onboarding flow),
 *      NOT from URL slug — trust-source-aligned with sibling LIFF actions.
 *   4. NEVER throws on expected branches — returns a discriminated-union status.
 *   5. **Read-only.** Zero DB writes. Zero schema / migration touches.
 *   6. **Does NOT call `syncLineAccountForUser`** — closeout doc §6.7 KNOWN GAP
 *      lists 4 production consumers; this PR must NOT add a 5th.
 *
 * PII contract:
 *   - `lineUserId` is NEVER returned in full to the client. The action only
 *     surfaces a derived `lineBound: boolean` flag and a masked tail (last 4
 *     chars) for support-triage purposes. The raw 33-char LINE userId stays
 *     server-side.
 *   - Other PII (name / phone / email) flows through unmasked — the customer
 *     owns this data and is viewing their own profile. Client renders it
 *     verbatim; no masking needed.
 *
 * Cross-references:
 *   - docs/line-identity-convergence-closeout.md §6 (safety invariants)
 *   - docs/line-identity-convergence-closeout.md §7 "Ready to build" — this PR
 *     is the first item ("LINE 綁定狀態顯示 in customer-facing UI") foundation;
 *     the customer profile page enables the follow-up binding status badge PR.
 */

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { getCanonicalCustomerIdForSession } from "@/lib/customer-identity";

/** LIFF profile payload — tight projection of Customer + Store basics. */
export interface LiffCustomerProfile {
  /** Customer.id — opaque CUID; safe to return to client (already a server-issued id). */
  id: string;
  /** Customer.name — staff- or customer-entered display name. */
  name: string;
  /**
   * Customer.phone — normalized 09xxxxxxxx form. May be a placeholder
   * (e.g. `_oauth_line_xxxxxxxx`) if the customer reached the system via
   * Case C inline OAuth tx without phone collection; treat any non-09-prefix
   * value as "未填寫" at the view layer.
   */
  phone: string;
  /** Customer.email — may be null. */
  email: string | null;
  /**
   * Derived LINE binding state for view-layer display.
   * - "linked":   lineLinkStatus === LINKED && lineUserId is set
   * - "unlinked": lineUserId is null
   * - "needs_help": any other state (e.g. BLOCKED, drift) — view shows
   *                 "需店家協助確認" without leaking the raw enum value.
   *
   * View MUST NOT branch on raw `Customer.lineLinkStatus` enum directly —
   * only on this derived field. This keeps the customer-facing copy stable
   * even if backend states evolve.
   */
  lineStatus: "linked" | "unlinked" | "needs_help";
  /**
   * Customer.lineName — the displayName captured from LINE OAuth / LIFF.
   * Customer-facing label is "LINE 顯示名稱"; null → view shows
   * "未綁定或未填寫".
   */
  lineName: string | null;
  /**
   * Masked tail of `lineUserId` for support-triage display ONLY (e.g.
   * "U******abcd"). Full raw `lineUserId` is NEVER returned. null when
   * `lineStatus !== "linked"` (no binding to mask).
   *
   * Mask format: `U` + `******` + last-4-chars; surfaces JUST enough for
   * a customer to read it back to staff during a support call without
   * exposing the full identifier in the LIFF view. Matches the masking
   * pattern from `src/lib/line-bind-log.ts` `maskLineUserId` family.
   */
  lineUserIdMasked: string | null;
  /** Store display name (Store.name). */
  storeName: string;
  /** Store URL slug — needed by the view to construct "回會員中心" link. */
  storeSlug: string;
}

export type FetchLiffCustomerProfileResult =
  | { status: "ok"; profile: LiffCustomerProfile }
  | { status: "no_customer" }
  | { status: "service_unavailable" };

/**
 * Mask the LINE userId for support-triage display.
 *
 * Input:  `U1234567890abcdef1234567890abcdef` (typical 33-char shape)
 * Output: `U******cdef`
 *
 * - Always preserves the leading `U` so the masked string is visually
 *   identifiable as a LINE userId.
 * - Uses literal `******` (6 chars) for the masked region — consistent
 *   regardless of input length so two different lineUserIds produce
 *   visually similar shapes (preventing length-leakage).
 * - Last 4 chars preserved for support-call triage. Lowercase last-4 is
 *   short enough that an attacker can't reverse the full LINE userId,
 *   but long enough for a staff member to spot the correct customer in
 *   a back-office list.
 *
 * Edge cases:
 * - Input shorter than 7 chars → returns null (degenerate, would otherwise
 *   leak the entire string after the masked region).
 * - null / empty input → null.
 */
function maskLineUserIdForView(raw: string | null): string | null {
  if (!raw || raw.length < 7) return null;
  return `U******${raw.slice(-4)}`;
}

export async function fetchLiffCustomerProfile(): Promise<FetchLiffCustomerProfileResult> {
  // ── 1. Require CUSTOMER session ─────────────────────────────────
  let user;
  try {
    user = await requireSession();
  } catch {
    return { status: "no_customer" };
  }
  if (user.role !== "CUSTOMER") return { status: "no_customer" };

  // ── 2. Resolve canonical customer + store ───────────────────────
  // Do NOT trust session.customerId (may be stale; same design as
  // liff-my-bookings.ts / liff-my-wallets.ts).
  const customerId = await getCanonicalCustomerIdForSession(user);
  if (!customerId) return { status: "no_customer" };
  const storeId = user.storeId;
  if (!storeId) return { status: "no_customer" };

  // ── 3. Query — tight LIFF payload ────────────────────────────────
  //
  // The `where` clause uses BOTH `id: customerId` AND `storeId: storeId`
  // so a stale / cross-store session token (theoretically impossible but
  // worth the defensive guard) cannot read another store's customer row.
  // If the query returns no row, we treat as `no_customer` rather than
  // throwing — the customer-facing view shows the standard "請重新登入"
  // path managed by the LIFF shell.
  let row: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    lineLinkStatus: "UNLINKED" | "LINKED" | "BLOCKED";
    lineName: string | null;
    lineUserId: string | null;
    store: { name: string; slug: string };
  } | null;
  try {
    row = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        lineLinkStatus: true,
        lineName: true,
        lineUserId: true,
        store: { select: { name: true, slug: true } },
      },
    });
  } catch (err) {
    console.error("[fetchLiffCustomerProfile] query failed", err);
    return { status: "service_unavailable" };
  }
  if (!row) return { status: "no_customer" };

  // ── 4. Derive view-layer status (do NOT leak raw enum) ──────────
  //
  // Three customer-facing buckets:
  //   - "linked":    healthy bound state
  //   - "unlinked":  no LINE binding (lineUserId null)
  //   - "needs_help": any other state (BLOCKED, or LINKED-without-lineUserId
  //                   drift which closeout doc §1 / §7 documents as bounded
  //                   follow-up paths). View shows neutral copy without
  //                   exposing the raw drift state to the end user.
  let lineStatus: LiffCustomerProfile["lineStatus"];
  if (row.lineLinkStatus === "LINKED" && row.lineUserId) {
    lineStatus = "linked";
  } else if (!row.lineUserId) {
    lineStatus = "unlinked";
  } else {
    lineStatus = "needs_help";
  }

  return {
    status: "ok",
    profile: {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      lineStatus,
      lineName: row.lineName,
      // Masked tail only — full lineUserId NEVER returned (PII contract).
      lineUserIdMasked: maskLineUserIdForView(row.lineUserId),
      storeName: row.store.name,
      storeSlug: row.store.slug,
    },
  };
}
