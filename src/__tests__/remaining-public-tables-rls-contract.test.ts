import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260824170000_harden_remaining_public_tables/migration.sql",
  ),
  "utf8",
);

const protectedTables = [
  "GoogleReviewInvite",
  "StoreLineNotificationRecipient",
  "MessengerAuditRun",
  "_prisma_migrations",
];

describe("remaining public-table RLS hardening", () => {
  it.each(protectedTables)("enables RLS for %s", (table) => {
    expect(migration).toContain(
      `ALTER TABLE IF EXISTS "${table}" ENABLE ROW LEVEL SECURITY;`,
    );
  });

  it("keeps the browser Data API closed and preserves owner-based Prisma access", () => {
    expect(migration).not.toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).not.toMatch(/CREATE\s+POLICY/i);
    expect(migration).not.toMatch(/GRANT\s+/i);
  });
});
