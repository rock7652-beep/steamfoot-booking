import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const historicalMigration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260729090000_add_messenger_audit_runs/migration.sql",
  ),
  "utf8",
);
const reconciliation = readFileSync(
  resolve(process.cwd(), "scripts/reconcile-messenger-migration.mjs"),
  "utf8",
);
const documentation = readFileSync(
  resolve(process.cwd(), "docs/production-migration-reconciliation.md"),
  "utf8",
);

describe("MessengerAuditRun RLS contract", () => {
  it("keeps RLS out of the immutable historical migration", () => {
    expect(historicalMigration).not.toContain("ROW LEVEL SECURITY");
    expect(historicalMigration).not.toMatch(/CREATE\s+POLICY/i);
  });

  it("requires a disabled baseline for reconciliation and reserves RLS for a forward migration", () => {
    expect(reconciliation).toContain('SELECT NOT c.relrowsecurity AS "isRlsDisabled"');
    expect(reconciliation).toContain("RLS state is not the expected disabled baseline");
    expect(reconciliation).not.toContain("ENABLE ROW LEVEL SECURITY");
    expect(documentation).toMatch(/separate security\s+remediation/);
    expect(documentation).toContain("forward-only migration");
  });
});
