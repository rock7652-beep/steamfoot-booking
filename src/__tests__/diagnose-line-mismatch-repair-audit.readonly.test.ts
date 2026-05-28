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
      /prisma\s*(?:\.\w+)*\.(create|createMany|update|updateMany|upsert|delete|deleteMany|executeRaw|executeRawUnsafe|queryRawUnsafe)\s*\(/;
    const match = CODE.match(writeMethodRegex);
    expect(match, `unexpected Prisma write call: ${match?.[0]}`).toBeNull();
  });

  it("does not start a Prisma $transaction (only $disconnect allowed)", () => {
    expect(CODE.match(/\.\$transaction\s*\(/)).toBeNull();
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
