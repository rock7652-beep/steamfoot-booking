import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FEATURES, PLAN_FEATURES } from "@/lib/feature-flags";

const root = process.cwd();
const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  resolve(root, "prisma/migrations/20260723190000_add_digital_butler_core_model/migration.sql"),
  "utf8",
);

describe("Digital Butler PR-1 additive migration contract", () => {
  it("keeps every store disabled by default and adds no enable/backfill update", () => {
    expect(schema).toContain("digitalButlerEnabled       Boolean              @default(false)");
    expect(migration).toContain('ADD COLUMN "digitalButlerEnabled" BOOLEAN NOT NULL DEFAULT false');
    expect(migration).not.toMatch(/UPDATE\s+"Store"/i);
  });

  it("keeps DIGITAL_BUTLER HQ-entitlement-only instead of granting it to a plan", () => {
    expect(FEATURES.DIGITAL_BUTLER).toBe("digital_butler");
    expect(Object.values(PLAN_FEATURES).flat()).not.toContain(FEATURES.DIGITAL_BUTLER);
  });

  it("adds the store-scoped tables, compound lead idempotency, and RLS", () => {
    for (const table of [
      "DigitalButlerTemplate", "StoreDigitalButlerFlow", "DigitalButlerFlowVersion",
      "DigitalButlerStep", "DigitalButlerConversation", "DigitalButlerAnswer",
      "DigitalButlerLead", "DigitalButlerExecutionLog",
    ]) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
      expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain('"storeId", "conversationId", "completionActionKey"');
  });

  it("enforces same-store foreign keys instead of relying only on service checks", () => {
    expect(migration).toContain('FOREIGN KEY ("flowId", "storeId") REFERENCES "StoreDigitalButlerFlow"("id", "storeId")');
    expect(migration).toContain('FOREIGN KEY ("flowVersionId", "storeId") REFERENCES "DigitalButlerFlowVersion"("id", "storeId")');
    expect(migration).toContain('FOREIGN KEY ("conversationId", "storeId") REFERENCES "DigitalButlerConversation"("id", "storeId")');
    expect(migration).toContain('FOREIGN KEY ("stepId", "storeId") REFERENCES "DigitalButlerStep"("id", "storeId")');
  });
});
