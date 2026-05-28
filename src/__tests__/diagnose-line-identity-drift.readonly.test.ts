/**
 * diagnose-line-identity-drift.ts — read-only contract test (PR-F1)
 *
 * The diagnostic script must never write to the database, regardless of flags.
 * Importing and executing it in a test runner is awkward (top-level Prisma
 * client + process.exit), so this test asserts the contract statically by
 * scanning the source text:
 *   - no prisma.*.create / update / upsert / delete / executeRaw / queryRawUnsafe
 *   - no import of repair-* / mergePlaceholder / backfill-* services
 *   - no `await ... .$transaction(` (we only use $disconnect)
 *
 * If a future edit accidentally adds a write call, this test fails before the
 * script can ever land in prod.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = join(
  __dirname,
  "..",
  "..",
  "scripts",
  "diagnose-line-identity-drift.ts",
);

const SOURCE = readFileSync(SCRIPT_PATH, "utf8");

// Strip line comments / block comments so the read-only contract isn't tripped
// by descriptive prose ("不寫 DB", "不執行 update", etc.) that mentions write verbs.
const CODE = SOURCE
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("diagnose-line-identity-drift script (read-only contract)", () => {
  it("does not call any Prisma mutation method", () => {
    const writeMethodRegex =
      /prisma\s*(?:\.\w+)*\.(create|createMany|update|updateMany|upsert|delete|deleteMany|executeRaw|executeRawUnsafe|queryRawUnsafe)\s*\(/;
    const match = CODE.match(writeMethodRegex);
    expect(match, `unexpected Prisma write call: ${match?.[0]}`).toBeNull();
  });

  it("does not start a Prisma $transaction (only $disconnect allowed)", () => {
    const txRegex = /\.\$transaction\s*\(/;
    expect(CODE.match(txRegex)).toBeNull();
  });

  it("does not import any write-side service / repair / backfill helper", () => {
    const writeImportRegex =
      /import[^;]*from\s+["'](?:.*\/(?:identity-repair|repair-line-merge-orphans|customer-merge|bind-line-to-customer|line-account-sync|referral-points|referral-binding|backfill-[^"']+))["']/;
    const match = CODE.match(writeImportRegex);
    expect(match, `unexpected write-side import: ${match?.[0]}`).toBeNull();
  });

  it("imports mask helpers from line-bind-log (output must be masked)", () => {
    expect(CODE).toMatch(
      /from\s+["']\.\.\/src\/lib\/line-bind-log["']/,
    );
    expect(CODE).toMatch(/maskLineUserId/);
    expect(CODE).toMatch(/maskId/);
    expect(CODE).toMatch(/maskPhone/);
  });

  it("does not accept a --confirm-write / --execute flag", () => {
    // Defensive: explicit assertion that the script offers no write toggle.
    expect(CODE).not.toMatch(/--confirm-write|--execute|CONFIRM_WRITE|DRY_RUN/);
  });

  // ── PR-F1.1: triage enrichment invariants ─────────────
  //
  // The account-mismatch check now enriches each masked sample with
  // read-only triage signals (createdAt / passwordHash boolean /
  // related counts). These assertions guarantee the enrichment cannot
  // accidentally regress into PII leakage or write methods.

  it("never selects email — even for masked display", () => {
    // email is high-PII; this diagnostic doesn't need it for any check.
    // (phone IS selected by Check 1 and printed via maskPhone — that's
    // intentional and pre-existing PR-F1 behavior, not regressed here.)
    expect(CODE).not.toMatch(/\bemail\s*:\s*true/);
  });

  it("never selects raw passwordHash for printing — only its boolean presence", () => {
    // It IS legitimate to `select: { passwordHash: true }` to derive a
    // boolean, but the raw value must never be printed. The print path uses
    // `hasPwd=${...hasPwd}` (a boolean), never `${...passwordHash}`.
    expect(CODE).not.toMatch(/\$\{[^}]*passwordHash[^}]*\}/);
  });

  // Helper: extract the body of the triage helper function. Uses lookahead
  // for the next top-level declaration so nested `}` inside the function
  // body don't end the match prematurely.
  function extractTriageHelperBody(): string {
    const m = CODE.match(
      /async function loadAccountMismatchTriage[\s\S]*?(?=\n(?:async )?function |\ntype |\nfunction )/,
    );
    return m ? m[0] : "";
  }

  it("uses count() / findUnique for triage — never findMany", () => {
    // PR-F1.1 enrichment uses count() and findUnique only. A bare findMany
    // would scale poorly and could pull large rows. Existing findMany calls
    // on Customer / Account already exist for the main scan — those are
    // fine. New triage-loader helper must not introduce another.
    const body = extractTriageHelperBody();
    expect(body.length, "loadAccountMismatchTriage helper not found").toBeGreaterThan(0);
    expect(body).not.toMatch(/\.findMany\s*\(/);
  });

  it("triage helper only reads the 4 expected models (user / account / booking / transaction)", () => {
    // Whitelist-style assertion: prevent quiet expansion into other tables.
    const body = extractTriageHelperBody();
    expect(body.length).toBeGreaterThan(0);
    const allowed = new Set(["user", "account", "booking", "transaction"]);
    const prismaMethodCalls = [...body.matchAll(/prisma\.(\w+)\.\w+\s*\(/g)].map(
      (m) => m[1],
    );
    for (const model of prismaMethodCalls) {
      expect(allowed.has(model), `triage helper touched unexpected model: ${model}`).toBe(true);
    }
    expect(prismaMethodCalls.length).toBeGreaterThan(0);
  });
});
