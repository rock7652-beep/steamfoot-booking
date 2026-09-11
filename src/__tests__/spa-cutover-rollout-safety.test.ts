import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cutoverMigration = resolve(
  __dirname,
  "../../prisma/migrations/20260901154500_remove_legacy_spa_shared_schema/migration.sql",
);

describe("SPA cutover rollout safety", () => {
  it("does not remove legacy shared storage in the application cutover", () => {
    const sql = readFileSync(cutoverMigration, "utf8");

    expect(sql).not.toMatch(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"(?:StoredValue|Treatment|Staff|Professional)/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"Booking"[\s\S]*DROP\s+COLUMN/i);
    expect(sql).not.toMatch(/DROP\s+TYPE\s+(?:IF\s+EXISTS\s+)?"StaffAvailabilityExceptionType"/i);
  });
});
