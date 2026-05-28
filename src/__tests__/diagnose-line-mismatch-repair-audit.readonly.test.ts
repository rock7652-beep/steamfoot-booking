/**
 * diagnose-line-mismatch-repair-audit.ts — read-only contract test (PR-F1.2)
 *
 * Same guarantee as diagnose-line-identity-drift.readonly.test.ts: this PR-F1.2
 * audit script must never be able to write to the DB, regardless of flags. We
 * assert the contract statically by scanning the source text so a future edit
 * that adds a write call fails CI before the script can land in prod.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Runtime imports (PR-F1.2 Codex P1 follow-up): exercise classify() directly
// so the cross-store guard has true behavioural test coverage, not just
// source-text grep.
import {
  classify,
  type Footprint,
  type UserSide,
} from "../../scripts/diagnose-line-mismatch-repair-audit";

const SCRIPT_PATH = join(
  __dirname,
  "..",
  "..",
  "scripts",
  "diagnose-line-mismatch-repair-audit.ts",
);

const SOURCE = readFileSync(SCRIPT_PATH, "utf8");

// Strip comments so descriptive prose mentioning write verbs (e.g. "不寫 DB",
// "merge / deactivate") doesn't trip the contract checks.
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(
  /(^|[^:])\/\/.*$/gm,
  "$1",
);

describe("diagnose-line-mismatch-repair-audit script (read-only contract)", () => {
  it("does not call any Prisma mutation method", () => {
    const writeMethodRegex =
      /prisma\s*(?:\.\w+)*\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;
    const match = CODE.match(writeMethodRegex);
    expect(match, `unexpected Prisma write call: ${match?.[0]}`).toBeNull();
  });

  it("does not start a Prisma $transaction (only $disconnect allowed)", () => {
    expect(CODE.match(/\.\$transaction\s*\(/)).toBeNull();
  });

  // PR-F1.2 Codex P2: the previous mutation regex only caught dot-prefixed
  // method names. Prisma raw-SQL APIs are $-prefixed (prisma.$executeRaw,
  // prisma.$queryRaw, …) and slipped past it. This diagnostic has no
  // legitimate need for raw SQL — deny all prisma.$* APIs except $disconnect.
  it("does not use any Prisma raw-SQL API ($executeRaw / $queryRaw etc.)", () => {
    const explicit = [
      "$executeRaw",
      "$executeRawUnsafe",
      "$queryRaw",
      "$queryRawUnsafe",
    ];
    for (const api of explicit) {
      const re = new RegExp(`prisma\\.\\${api}\\s*\\(`);
      expect(
        CODE.match(re),
        `unexpected Prisma raw API usage: prisma.${api}(`,
      ).toBeNull();
    }
  });

  it("denies every prisma.$* API except $disconnect (forward-proof)", () => {
    // Catches future raw APIs Prisma may add ($runCommandRaw, etc.) without
    // having to enumerate them. $disconnect is the only $-prefixed API this
    // script is allowed to call.
    const dollarCalls = [...CODE.matchAll(/prisma\.\$(\w+)\s*\(/g)].map(
      (m) => m[1],
    );
    const allowedDollarApis = new Set(["disconnect"]);
    for (const api of dollarCalls) {
      expect(
        allowedDollarApis.has(api),
        `unexpected Prisma $-API usage: prisma.$${api}(`,
      ).toBe(true);
    }
  });

  it("does not import any write-side service / repair / backfill helper", () => {
    const writeImportRegex =
      /import[^;]*from\s+["'](?:.*\/(?:identity-repair|repair-line-merge-orphans|customer-merge|bind-line-to-customer|line-account-sync|referral-points|referral-binding|backfill-[^"']+))["']/;
    const match = CODE.match(writeImportRegex);
    expect(match, `unexpected write-side import: ${match?.[0]}`).toBeNull();
  });

  it("imports mask helpers from line-bind-log (output must be masked)", () => {
    expect(CODE).toMatch(/from\s+["']\.\.\/src\/lib\/line-bind-log["']/);
    expect(CODE).toMatch(/maskLineUserId/);
    expect(CODE).toMatch(/maskId/);
    // maskPhone is intentionally NOT required: this audit derives a
    // `placeholderPhone` boolean from Customer.phone and never prints the
    // raw phone value (enforced by the next test).
  });

  it("never prints the raw phone value (only the derived placeholder boolean)", () => {
    // Defensive: even though Customer.phone is selected to compute
    // `isPlaceholderPhone()`, the raw value must not leak into any console
    // output via template literal.
    expect(CODE).not.toMatch(/\$\{[^}]*\.phone[^}]*\}/);
    // And no direct console.log of a phone expression.
    expect(CODE).not.toMatch(/console\.\w+\([^)]*\.phone\b[^)]*\)/);
  });

  it("does not accept any write toggle flag", () => {
    expect(CODE).not.toMatch(
      /--confirm-write|--execute|--apply|CONFIRM_WRITE|DRY_RUN|APPLY/,
    );
  });

  it("never selects email — even for masked display", () => {
    expect(CODE).not.toMatch(/\bemail\s*:\s*true/);
  });

  it("never prints raw passwordHash — only its boolean presence", () => {
    expect(CODE).not.toMatch(/\$\{[^}]*passwordHash[^}]*\}/);
  });

  it("never prints a raw customer name", () => {
    // name is PII; this audit reports counts/booleans only.
    expect(CODE).not.toMatch(/\bname\s*:\s*true/);
    expect(CODE).not.toMatch(/\$\{[^}]*\.name[^}]*\}/);
  });

  it("only uses count / findUnique / findFirst / findMany reads on prisma", () => {
    const calls = [...CODE.matchAll(/prisma\.\w+\.(\w+)\s*\(/g)].map((m) => m[1]);
    const allowedReads = new Set(["count", "findUnique", "findFirst", "findMany"]);
    for (const method of calls) {
      expect(
        allowedReads.has(method),
        `unexpected non-read prisma method: ${method}`,
      ).toBe(true);
    }
    expect(calls.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────
// PR-F1.2 Codex P1 — cross-store guard runtime tests
//
// classify() must NOT recommend safe_reassign_account_only when the same
// lineUserId is present in more than one store, even if all other shell-vs-
// primary signals look like a clean A=shell / C=primary case.
// ──────────────────────────────────────────────────────────

const primaryC_Footprint: Footprint = {
  present: true,
  placeholderPhone: false,
  bookings: 5,
  transactions: 3,
  walletsTotal: 1,
  walletsActive: 1,
  walletSessions: 4,
  points: 50,
  messages: 0,
  checkins: 0,
  makeupCredits: 0,
  sponsored: 0,
  referralsMade: 0,
};

const emptyFootprint: Footprint = {
  present: false,
  placeholderPhone: false,
  bookings: 0,
  transactions: 0,
  walletsTotal: 0,
  walletsActive: 0,
  walletSessions: 0,
  points: 0,
  messages: 0,
  checkins: 0,
  makeupCredits: 0,
  sponsored: 0,
  referralsMade: 0,
};

const realCustomerUser: UserSide = {
  exists: true,
  hasPwd: true,
  status: "ACTIVE",
  createdAt: new Date("2025-08-10T00:00:00Z"),
  otherAccounts: 0,
  hasCustomer: true,
  customerId: "cust-real",
};

const emptyShellAccountUser: UserSide = {
  exists: true,
  hasPwd: false,
  status: "ACTIVE",
  createdAt: new Date("2026-04-22T00:00:00Z"),
  otherAccounts: 0,
  hasCustomer: false,
  customerId: null,
};

// PR-F1.2 Codex P1 v2: account-side user that OWNS a placeholder shell
// Customer (chenjiajia pattern). Used to exercise the needs_customer_merge
// branch and verify the unified cross-store guard catches it.
const placeholderShellAccountUser: UserSide = {
  exists: true,
  hasPwd: false,
  status: "ACTIVE",
  createdAt: new Date("2026-04-22T00:00:00Z"),
  otherAccounts: 0,
  hasCustomer: true, // ← key difference vs emptyShellAccountUser
  customerId: "cust-acct-placeholder",
};

const placeholderShellFootprint: Footprint = {
  present: true,
  placeholderPhone: true, // ← _oauth_line_* phone signal
  bookings: 0,
  transactions: 0,
  walletsTotal: 0,
  walletsActive: 0,
  walletSessions: 0,
  points: 0,
  messages: 0,
  checkins: 0,
  makeupCredits: 0,
  sponsored: 0,
  referralsMade: 0,
};

describe("classify() cross-store guard (PR-F1.2 P1)", () => {
  it("single-store empty-shell case → safe_reassign_account_only (baseline preserved)", () => {
    const r = classify({
      cUser: realCustomerUser,
      cFoot: primaryC_Footprint,
      aUser: emptyShellAccountUser,
      aFoot: emptyFootprint,
      crossStoreLineUserCount: 1,
    });
    expect(r.recommendation).toBe("safe_reassign_account_only");
    expect(r.canReassignSafely).toBe(true);
  });

  it("same-lineUserId in 2 stores → MUST NOT recommend safe_reassign_account_only", () => {
    const r = classify({
      cUser: realCustomerUser,
      cFoot: primaryC_Footprint,
      aUser: emptyShellAccountUser,
      aFoot: emptyFootprint,
      crossStoreLineUserCount: 2, // ← the only difference vs baseline
    });
    expect(r.recommendation).not.toBe("safe_reassign_account_only");
  });

  it("same-lineUserId in 2 stores → downgrades to needs_manual_business_check", () => {
    const r = classify({
      cUser: realCustomerUser,
      cFoot: primaryC_Footprint,
      aUser: emptyShellAccountUser,
      aFoot: emptyFootprint,
      crossStoreLineUserCount: 2,
    });
    expect(r.recommendation).toBe("needs_manual_business_check");
    expect(r.canReassignSafely).toBe(false);
    // Reason must explicitly call out the cross-store signal (Codex required).
    const reasonsBlob = r.reasons.join(" | ");
    expect(reasonsBlob).toMatch(
      /cross_store_line_user_detected|same_line_user_multiple_stores/,
    );
  });

  it("same-lineUserId in 3+ stores → still downgrades (count > 1 threshold)", () => {
    const r = classify({
      cUser: realCustomerUser,
      cFoot: primaryC_Footprint,
      aUser: emptyShellAccountUser,
      aFoot: emptyFootprint,
      crossStoreLineUserCount: 5,
    });
    expect(r.recommendation).toBe("needs_manual_business_check");
  });

  it("default crossStoreLineUserCount (undefined) treats as single-store", () => {
    // Backward-compat: existing callers / tests that don't pass the field
    // must still get the legacy behaviour.
    const r = classify({
      cUser: realCustomerUser,
      cFoot: primaryC_Footprint,
      aUser: emptyShellAccountUser,
      aFoot: emptyFootprint,
    });
    expect(r.recommendation).toBe("safe_reassign_account_only");
  });
});

// ──────────────────────────────────────────────────────────
// PR-F1.2 Codex P1 v2 — guard MUST also cover needs_customer_merge
//
// Original P1 patch only protected the bare-empty-shell path. But the
// chenjiajia branch (placeholder shell Customer owned by account.user) also
// returns canReassignSafely=true and is equally unsafe cross-store. Tests
// below assert the unified post-decision-tree guard covers BOTH paths.
// ──────────────────────────────────────────────────────────

describe("classify() cross-store guard — needs_customer_merge branch (PR-F1.2 P1 v2)", () => {
  it("single-store + placeholder shell Customer → needs_customer_merge (baseline preserved)", () => {
    const r = classify({
      cUser: realCustomerUser,
      cFoot: primaryC_Footprint,
      aUser: placeholderShellAccountUser,
      aFoot: placeholderShellFootprint,
      crossStoreLineUserCount: 1,
    });
    expect(r.recommendation).toBe("needs_customer_merge");
    expect(r.canReassignSafely).toBe(true);
  });

  it("cross-store + placeholder shell Customer → MUST downgrade to needs_manual_business_check", () => {
    const r = classify({
      cUser: realCustomerUser,
      cFoot: primaryC_Footprint,
      aUser: placeholderShellAccountUser,
      aFoot: placeholderShellFootprint,
      crossStoreLineUserCount: 2,
    });
    expect(r.recommendation).toBe("needs_manual_business_check");
    expect(r.recommendation).not.toBe("needs_customer_merge");
  });

  it("cross-store + placeholder shell Customer → canReassignSafely=false + cross_store reason", () => {
    const r = classify({
      cUser: realCustomerUser,
      cFoot: primaryC_Footprint,
      aUser: placeholderShellAccountUser,
      aFoot: placeholderShellFootprint,
      crossStoreLineUserCount: 3,
    });
    expect(r.canReassignSafely).toBe(false);
    const reasonsBlob = r.reasons.join(" | ");
    expect(reasonsBlob).toMatch(
      /cross_store_line_user_detected|same_line_user_multiple_stores/,
    );
    // The original merge-branch reasons must remain so an operator can see
    // what the recommendation *would have been* before the downgrade.
    expect(reasonsBlob).toMatch(/account_side_shell_customer/);
  });

  it("cross-store guard never leaves canReassignSafely=true regardless of which auto-safe path fired", () => {
    // Meta-assertion: exercise both auto-safe paths under cross-store and
    // assert canReassignSafely is false in every downgrade.
    const cases = [
      {
        label: "bare-empty-shell",
        aUser: emptyShellAccountUser,
        aFoot: emptyFootprint,
      },
      {
        label: "placeholder-shell-merge",
        aUser: placeholderShellAccountUser,
        aFoot: placeholderShellFootprint,
      },
    ];
    for (const c of cases) {
      const r = classify({
        cUser: realCustomerUser,
        cFoot: primaryC_Footprint,
        aUser: c.aUser,
        aFoot: c.aFoot,
        crossStoreLineUserCount: 2,
      });
      expect(
        r.canReassignSafely,
        `${c.label}: canReassignSafely must be false on cross-store downgrade`,
      ).toBe(false);
      expect(
        r.recommendation,
        `${c.label}: recommendation must downgrade to needs_manual_business_check on cross-store`,
      ).toBe("needs_manual_business_check");
    }
  });

  it("cross-store guard does NOT touch recommendations that were already canReassignSafely=false", () => {
    // do_not_touch / needs_manual_business_check / direction_flipped etc. all
    // start with canReassignSafely=false. The guard predicate is
    // `crossStoreLineUserCount > 1 && canReassignSafely` so these must pass
    // through unchanged.
    const r = classify({
      cUser: realCustomerUser,
      cFoot: primaryC_Footprint,
      // A 有 Customer 但無經濟足跡，且不是乾淨空殼 → needs_manual_business_check
      // path with canReassignSafely=false (no auto-safe path fired).
      aUser: {
        ...placeholderShellAccountUser,
        hasPwd: true, // breaks the shell classification
      },
      aFoot: placeholderShellFootprint,
      crossStoreLineUserCount: 2,
    });
    expect(r.recommendation).toBe("needs_manual_business_check");
    expect(r.canReassignSafely).toBe(false);
    // The cross-store reason should NOT be appended here because the path
    // never claimed to be auto-safe in the first place.
    const reasonsBlob = r.reasons.join(" | ");
    expect(reasonsBlob).not.toMatch(/cross_store_line_user_detected/);
  });
});
