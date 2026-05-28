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
