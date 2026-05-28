/**
 * Tests for scripts/repair-line-mismatch-pr-f2-1.ts (PR-F2.1).
 *
 * Two layers of coverage:
 *   1. Source-text contract — guarantees the script cannot become a
 *      multi-record / batch / forced-write tool in future edits.
 *   2. Runtime — exercises `runInvariants()` and `rejectForbiddenFlags()`
 *      with crafted PreState / argv fixtures so every one of the 19
 *      invariants has both a PASS and a FAIL path covered.
 *
 * NO DB access. NO --apply. NO mutation. Pure unit tests.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  rejectForbiddenFlags,
  FORBIDDEN_FLAG_TOKENS,
  runInvariants,
  type PreState,
  type InvariantConstants,
} from "../../scripts/repair-line-mismatch-pr-f2-1";

const SCRIPT_PATH = join(
  __dirname,
  "..",
  "..",
  "scripts",
  "repair-line-mismatch-pr-f2-1.ts",
);

// Strip comments so descriptive prose mentioning forbidden tokens
// (e.g. "no --force") doesn't trip source-text contract checks.
const SOURCE = readFileSync(SCRIPT_PATH, "utf8");
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(
  /(^|[^:])\/\/.*$/gm,
  "$1",
);

// ──────────────────────────────────────────────────────────────────────
// Source-text contract: script must remain single-record / dry-run-default
// ──────────────────────────────────────────────────────────────────────

describe("repair-line-mismatch-pr-f2-1 script (source-text contract)", () => {
  it("DRY RUN is default — APPLY is gated solely by argv includes('--apply')", () => {
    // Must check process.argv.includes("--apply"); must not default APPLY to true.
    expect(CODE).toMatch(/const\s+APPLY\s*=\s*process\.argv\.includes\(\s*["']--apply["']\s*\)/);
    expect(CODE).not.toMatch(/const\s+APPLY\s*=\s*true/);
  });

  it("declares no forbidden batch / loop / from-file / force flag", () => {
    // The script itself names FORBIDDEN_FLAG_TOKENS to reject them — that
    // legitimate naming would match a naive grep, so we look for ACCEPTANCE
    // shapes instead (e.g. process.argv.includes("--force")).
    const acceptanceShapes = [
      /process\.argv\.includes\(\s*["']--force["']\s*\)/,
      /process\.argv\.includes\(\s*["']--batch["']\s*\)/,
      /process\.argv\.includes\(\s*["']--all["']\s*\)/,
      /process\.argv\.includes\(\s*["']--from-file["']\s*\)/,
      /process\.argv\.includes\(\s*["']--customer-id["']\s*\)/,
      /process\.argv\.includes\(\s*["']--skip-invariants["']\s*\)/,
    ];
    for (const re of acceptanceShapes) {
      expect(CODE, `script accepts a forbidden flag matching ${re}`).not.toMatch(re);
    }
  });

  it("contains no loop over customer / customerId / candidates collections", () => {
    // No `for (... of customers)` / `customers.forEach` / `.map(c => prisma...)`
    // that would imply batch over multiple records.
    expect(CODE).not.toMatch(/for\s*\(.*\bof\s+(candidates|customers|records|mismatches)\b/);
    expect(CODE).not.toMatch(/\b(candidates|customers|records|mismatches)\b\s*\.\s*forEach\s*\(/);
  });

  it("does not import any repair / merge / backfill / sync service", () => {
    const writeImportRegex =
      /import[^;]*from\s+["'](?:.*\/(?:identity-repair|repair-line-merge-orphans|customer-merge|bind-line-to-customer|line-account-sync|referral-points|referral-binding|backfill-[^"']+))["']/;
    const match = CODE.match(writeImportRegex);
    expect(match, `unexpected write-side import: ${match?.[0]}`).toBeNull();
  });

  it("Serializable isolation is used for the apply transaction", () => {
    // Per PR-F2.0 §3.1 step [6]: "$transaction (Serializable)"
    expect(CODE).toMatch(/isolationLevel:\s*Prisma\.TransactionIsolationLevel\.Serializable/);
  });

  it("requires OPERATOR_USER_ID for --apply (AuditLog.actorUserId guard, §6.1)", () => {
    expect(CODE).toMatch(/OPERATOR_USER_ID/);
    // Specifically: read env, fail when missing.
    expect(CODE).toMatch(/process\.env\.OPERATOR_USER_ID/);
  });

  it("writes all 4 AuditLog rows: L0 summary + L1 + L2 + L3", () => {
    expect(CODE).toMatch(/LINE_MISMATCH_REPAIR_APPLY/);
    expect(CODE).toMatch(/LINE_MISMATCH_REPAIR_REASSIGN_ACCOUNT/);
    expect(CODE).toMatch(/LINE_MISMATCH_REPAIR_MERGE_PLACEHOLDER/);
    expect(CODE).toMatch(/LINE_MISMATCH_REPAIR_SUSPEND_ORPHAN/);
    // Plus a rollback-aware A1 needs to know the ROLLBACK action name.
    expect(CODE).toMatch(/LINE_MISMATCH_REPAIR_ROLLBACK/);
  });

  it("uses mask helpers for any cuid / phone / lineUserId echo (no raw PII print)", () => {
    // Phone / lineUserId values appear in the constants block as required by
    // PR-F2.0 §3.1 ("hard-coded constants"). Outside the constants block, any
    // CANONICAL_PHONE / LINE_USER_ID reference inside a template literal MUST
    // be wrapped in maskPhone() / maskLineUserId(). This regex catches the
    // unmasked pattern.
    expect(CODE).not.toMatch(/`[^`]*\$\{\s*CANONICAL_PHONE\s*\}[^`]*`/);
    expect(CODE).not.toMatch(/`[^`]*\$\{\s*LINE_USER_ID\s*\}[^`]*`/);
  });

  it("does not call any Prisma raw-SQL API", () => {
    // PR-F2.0 doc disallows $executeRaw/$queryRaw style usage in repair scripts.
    const dollarCalls = [...CODE.matchAll(/prisma\.\$(\w+)\s*\(/g)].map((m) => m[1]);
    const txCalls = [...CODE.matchAll(/tx\.\$(\w+)\s*\(/g)].map((m) => m[1]);
    const allowedDollarApis = new Set(["disconnect", "transaction"]);
    for (const api of [...dollarCalls, ...txCalls]) {
      expect(
        allowedDollarApis.has(api),
        `unexpected Prisma $-API usage: $${api}(`,
      ).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────
// Runtime: rejectForbiddenFlags()
// ──────────────────────────────────────────────────────────────────────

describe("rejectForbiddenFlags()", () => {
  it("returns null for empty / clean argv", () => {
    expect(rejectForbiddenFlags([])).toBeNull();
    expect(rejectForbiddenFlags(["--apply"])).toBeNull();
  });

  it("rejects every documented forbidden flag", () => {
    for (const tok of FORBIDDEN_FLAG_TOKENS) {
      expect(rejectForbiddenFlags([tok])).toBe(tok);
    }
  });

  it("rejects --foo=value forms (e.g. --customer-id=ck...)", () => {
    expect(rejectForbiddenFlags(["--customer-id=ckxxx"])).toBe("--customer-id=ckxxx");
    expect(rejectForbiddenFlags(["--from-file=mismatches.json"])).toBe(
      "--from-file=mismatches.json",
    );
  });

  it("does not reject --apply", () => {
    expect(rejectForbiddenFlags(["--apply"])).toBeNull();
  });

  it("returns the first matching forbidden flag (deterministic abort)", () => {
    expect(rejectForbiddenFlags(["--apply", "--force", "--batch"])).toBe("--force");
  });
});

// ──────────────────────────────────────────────────────────────────────
// Runtime: runInvariants() — all 19 invariants
// ──────────────────────────────────────────────────────────────────────

// Test constants — opaque values, no relation to production
const TC: InvariantConstants = {
  CANONICAL_USER_ID: "test-canonical-user-id",
  PLACEHOLDER_USER_ID: "test-placeholder-user-id",
  CANONICAL_PHONE: "0900000001",
  LINE_USER_ID: "Utest_line_user_id_for_runtime_check",
};

/** Build a fully-passing PreState fixture. Each test perturbs one field. */
function happyPreState(): PreState {
  return {
    canonicalCustomer: {
      id: "test-canonical-cust",
      storeId: "test-store",
      userId: TC.CANONICAL_USER_ID,
      phone: TC.CANONICAL_PHONE,
      lineUserId: TC.LINE_USER_ID,
      lineLinkStatus: "LINKED",
      mergedIntoCustomerId: null,
    },
    placeholderCustomer: {
      id: "test-placeholder-cust",
      storeId: "test-store",
      userId: TC.PLACEHOLDER_USER_ID,
      phone: "_oauth_line_abc12345",
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
      mergedIntoCustomerId: null,
      selfBookingEnabled: true,
    },
    placeholderUser: {
      id: TC.PLACEHOLDER_USER_ID,
      status: "ACTIVE",
      passwordHash: null,
    },
    lineAccount: {
      id: "test-line-account",
      userId: TC.PLACEHOLDER_USER_ID,
      provider: "line",
      providerAccountId: TC.LINE_USER_ID,
    },
    canonicalSide: {
      bookings: 2,
      transactions: 2,
      walletsActive: 1,
    },
    placeholderSide: {
      bookings: 0,
      transactions: 0,
      walletsTotal: 0,
      walletSessions: 0,
      points: 0,
      messages: 0,
      checkins: 0,
      makeupCredits: 0,
      sponsored: 0,
      referralsMade: 0,
      otherAccounts: 0,
    },
    crossStoreDistinctStoreCount: 1,
    rollback: {
      applyRowIds: [],
      rolledBackApplyIds: new Set(),
      activeApplyCount: 0,
    },
  };
}

function expectPass(results: ReturnType<typeof runInvariants>, name: string): void {
  const r = results.find((x) => x.name === name);
  expect(r, `invariant ${name} not found in results`).toBeDefined();
  expect(r?.pass, `invariant ${name} expected to PASS but failed: ${r?.observed}`).toBe(true);
}

function expectFail(results: ReturnType<typeof runInvariants>, name: string): void {
  const r = results.find((x) => x.name === name);
  expect(r, `invariant ${name} not found in results`).toBeDefined();
  expect(r?.pass, `invariant ${name} expected to FAIL but passed: ${r?.observed}`).toBe(false);
}

describe("runInvariants() — happy path", () => {
  it("emits exactly 19 results", () => {
    const results = runInvariants(happyPreState(), TC);
    expect(results).toHaveLength(19);
  });

  it("all 19 invariants PASS on a fully-valid PreState", () => {
    const results = runInvariants(happyPreState(), TC);
    const failed = results.filter((r) => !r.pass);
    expect(failed.length, `expected all PASS, got fails: ${failed.map((r) => r.name).join(",")}`).toBe(0);
  });

  it("invariant names cover I1..I13 + F1..F4 + X1 + A1", () => {
    const names = runInvariants(happyPreState(), TC).map((r) => r.name);
    const expected = [
      "I1","I2","I3","I4","I5","I6","I7","I8","I9","I10","I11","I12","I13",
      "F1","F2","F3","F4",
      "X1",
      "A1",
    ];
    for (const n of expected) {
      expect(names, `missing invariant ${n}`).toContain(n);
    }
  });

  it("never echoes raw phone in observed strings (uses maskPhone)", () => {
    const results = runInvariants(happyPreState(), TC);
    const all = results.map((r) => r.observed).join(" | ");
    expect(all).not.toContain(TC.CANONICAL_PHONE);
  });

  it("never echoes raw lineUserId in observed strings (uses maskLineUserId)", () => {
    const results = runInvariants(happyPreState(), TC);
    const all = results.map((r) => r.observed).join(" | ");
    expect(all).not.toContain(TC.LINE_USER_ID);
  });
});

// One FAIL test per invariant — each perturbs exactly one field
describe("runInvariants() — per-invariant FAIL paths", () => {
  it("I1 fails when canonicalCustomer.userId mismatches", () => {
    const p = happyPreState();
    p.canonicalCustomer.userId = "wrong-user";
    expectFail(runInvariants(p, TC), "I1");
  });

  it("I2 fails when canonicalCustomer.lineUserId mismatches", () => {
    const p = happyPreState();
    p.canonicalCustomer.lineUserId = "Uwrong_line_user_other_value";
    expectFail(runInvariants(p, TC), "I2");
  });

  it("I3 fails when canonicalCustomer.lineLinkStatus !== LINKED", () => {
    const p = happyPreState();
    p.canonicalCustomer.lineLinkStatus = "UNLINKED";
    expectFail(runInvariants(p, TC), "I3");
  });

  it("I4 fails when canonicalCustomer.phone mismatches (defends ID-swap mistake)", () => {
    const p = happyPreState();
    p.canonicalCustomer.phone = "0900099999";
    expectFail(runInvariants(p, TC), "I4");
  });

  it("I5 fails when canonicalCustomer.mergedIntoCustomerId is non-null", () => {
    const p = happyPreState();
    p.canonicalCustomer.mergedIntoCustomerId = "some-target";
    expectFail(runInvariants(p, TC), "I5");
  });

  it("I6 fails when placeholderCustomer.userId !== PLACEHOLDER_USER_ID", () => {
    const p = happyPreState();
    p.placeholderCustomer.userId = "different-user";
    expectFail(runInvariants(p, TC), "I6");
  });

  it("I7 fails when placeholderCustomer.mergedIntoCustomerId is non-null", () => {
    const p = happyPreState();
    p.placeholderCustomer.mergedIntoCustomerId = "already-merged";
    expectFail(runInvariants(p, TC), "I7");
  });

  it("I8 fails when placeholderCustomer.lineUserId is non-null (would collide on uq_store_customer_line)", () => {
    const p = happyPreState();
    p.placeholderCustomer.lineUserId = "Usome_other_line_user_value";
    expectFail(runInvariants(p, TC), "I8");
  });

  it("I9 fails when placeholderCustomer.storeId !== canonicalCustomer.storeId", () => {
    const p = happyPreState();
    p.placeholderCustomer.storeId = "different-store";
    expectFail(runInvariants(p, TC), "I9");
  });

  it("I10 fails when placeholderCustomer.phone is not _oauth_line_*", () => {
    const p = happyPreState();
    p.placeholderCustomer.phone = "0911222333";
    expectFail(runInvariants(p, TC), "I10");
  });

  it("I11 fails when lineAccount.userId points elsewhere", () => {
    const p = happyPreState();
    p.lineAccount.userId = "some-other-user";
    expectFail(runInvariants(p, TC), "I11");
  });

  it("I12 fails when placeholderUser has a passwordHash (not pure OAuth shell)", () => {
    const p = happyPreState();
    p.placeholderUser.passwordHash = "$2b$something";
    expectFail(runInvariants(p, TC), "I12");
  });

  it("I13 fails when placeholderUser.status === SUSPENDED (defends double-apply)", () => {
    const p = happyPreState();
    p.placeholderUser.status = "SUSPENDED";
    expectFail(runInvariants(p, TC), "I13");
  });

  it("F1 fails when canonical side has zero bookings", () => {
    const p = happyPreState();
    p.canonicalSide.bookings = 0;
    expectFail(runInvariants(p, TC), "F1");
  });

  it("F2 fails when canonical side has zero transactions AND zero active wallets", () => {
    const p = happyPreState();
    p.canonicalSide.transactions = 0;
    p.canonicalSide.walletsActive = 0;
    expectFail(runInvariants(p, TC), "F2");
  });

  it("F2 passes when transactions = 0 but walletsActive >= 1 (logical OR)", () => {
    const p = happyPreState();
    p.canonicalSide.transactions = 0;
    p.canonicalSide.walletsActive = 1;
    expectPass(runInvariants(p, TC), "F2");
  });

  it.each([
    ["bookings", { bookings: 1 }],
    ["transactions", { transactions: 1 }],
    ["walletsTotal", { walletsTotal: 1 }],
    ["walletSessions", { walletSessions: 1 }],
    ["points", { points: 1 }],
    ["messages", { messages: 1 }],
    ["checkins", { checkins: 1 }],
    ["makeupCredits", { makeupCredits: 1 }],
    ["sponsored", { sponsored: 1 }],
    ["referralsMade", { referralsMade: 1 }],
  ])("F3 fails when placeholder side has %s > 0", (_label, perturbation) => {
    const p = happyPreState();
    Object.assign(p.placeholderSide, perturbation);
    expectFail(runInvariants(p, TC), "F3");
  });

  it("F4 fails when placeholder User has another Account (e.g. Google) linked", () => {
    const p = happyPreState();
    p.placeholderSide.otherAccounts = 1;
    expectFail(runInvariants(p, TC), "F4");
  });

  it("X1 fails when crossStoreDistinctStoreCount > 1", () => {
    const p = happyPreState();
    p.crossStoreDistinctStoreCount = 2;
    expectFail(runInvariants(p, TC), "X1");
  });

  // ── A1 idempotency / rollback-awareness ─────────────────────────────
  it("A1 passes when no APPLY exists (first repair)", () => {
    const p = happyPreState();
    // Default fixture: 0 apply rows, 0 rolled-back
    expectPass(runInvariants(p, TC), "A1");
  });

  it("A1 fails when an APPLY exists with NO matching ROLLBACK (double-apply guard)", () => {
    const p = happyPreState();
    p.rollback.applyRowIds = ["log-apply-1"];
    p.rollback.rolledBackApplyIds = new Set();
    p.rollback.activeApplyCount = 1;
    expectFail(runInvariants(p, TC), "A1");
  });

  // PR-F2.0 §2.4: "applied but rolled-back" is a legal pass state — re-repair
  // after rollback must NOT be permanently blocked by an append-only APPLY row.
  it("A1 passes when every APPLY row has a matching ROLLBACK (re-repair after rollback allowed)", () => {
    const p = happyPreState();
    p.rollback.applyRowIds = ["log-apply-1"];
    p.rollback.rolledBackApplyIds = new Set(["log-apply-1"]);
    p.rollback.activeApplyCount = 0; // closed-out
    expectPass(runInvariants(p, TC), "A1");
  });

  it("A1 fails when only some APPLYs have matching ROLLBACKs", () => {
    const p = happyPreState();
    p.rollback.applyRowIds = ["log-apply-1", "log-apply-2"];
    p.rollback.rolledBackApplyIds = new Set(["log-apply-1"]);
    p.rollback.activeApplyCount = 1; // log-apply-2 still active
    expectFail(runInvariants(p, TC), "A1");
  });
});

// ──────────────────────────────────────────────────────────────────────
// Test: any single FAIL means the script as a whole would ABORT.
// (Replicates the abort-on-any-fail logic in main()'s pre-flight.)
// ──────────────────────────────────────────────────────────────────────

describe("repair flow abort semantics", () => {
  it("any single invariant fail produces results.some(r => !r.pass) === true", () => {
    const p = happyPreState();
    p.placeholderUser.status = "SUSPENDED"; // breaks I13
    const results = runInvariants(p, TC);
    const failed = results.filter((r) => !r.pass);
    expect(failed.length).toBeGreaterThan(0);
    // Specifically I13:
    expect(failed.map((r) => r.name)).toContain("I13");
  });

  it("default argv (no --apply) means APPLY-gate logic in source treats it as DRY RUN", () => {
    // Source-level assertion: the only code path that writes is gated by
    // `if (!APPLY) { ...return; }` BEFORE any tx call. Confirm by structure.
    expect(CODE).toMatch(/if\s*\(\s*!\s*APPLY\s*\)/);
    // And the tx block appears AFTER the dry-run gate.
    const gateIdx = CODE.search(/if\s*\(\s*!\s*APPLY\s*\)/);
    const txIdx = CODE.search(/prisma\.\$transaction\(/);
    expect(gateIdx, "dry-run gate not found").toBeGreaterThan(-1);
    expect(txIdx, "$transaction call not found").toBeGreaterThan(-1);
    expect(txIdx, "transaction must appear after dry-run gate").toBeGreaterThan(gateIdx);
  });
});
