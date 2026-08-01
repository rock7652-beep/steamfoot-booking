import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260729090000_add_messenger_audit_runs/migration.sql",
  ),
  "utf8",
);

describe("MessengerAuditRun migration RLS contract", () => {
  it("enables fail-closed RLS without adding a public policy", () => {
    expect(migration).toContain(
      'ALTER TABLE "MessengerAuditRun" ENABLE ROW LEVEL SECURITY;',
    );
    expect(migration).not.toMatch(/CREATE\s+POLICY/i);
  });
});
