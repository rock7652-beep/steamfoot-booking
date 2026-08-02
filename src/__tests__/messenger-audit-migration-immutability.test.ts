import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260729090000_add_messenger_audit_runs/migration.sql",
);
const productionChecksum =
  "6edbd88d9fd2ab9e368b963d21f7d90ef2ed1f8e8c467a29c20f9a3c8d8e1488";

function checksum(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

describe("published MessengerAuditRun migration immutability", () => {
  it("matches the checksum recorded by the failed Production migration", () => {
    expect(checksum(readFileSync(migrationPath, "utf8"))).toBe(productionChecksum);
  });

  it("does not fold the deferred RLS change into immutable history", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain('CREATE TABLE "MessengerAuditRun"');
    expect(migration).not.toContain('ENABLE ROW LEVEL SECURITY');
  });
});
