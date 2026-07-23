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
    expect(migration).toContain('FOREIGN KEY ("conversationId", "storeId") REFERENCES "DigitalButlerConversation"("id", "storeId")');
    expect(migration).toContain('FOREIGN KEY ("stepId", "storeId") REFERENCES "DigitalButlerStep"("id", "storeId")');
  });

  it("rejects a conversation whose version belongs to another flow in the same store", () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "DigitalButlerFlowVersion_id_flowId_storeId_key" ON "DigitalButlerFlowVersion"("id", "flowId", "storeId")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("flowVersionId", "flowId", "storeId") REFERENCES "DigitalButlerFlowVersion"("id", "flowId", "storeId")',
    );
    expect(schema).toContain(
      "@relation(fields: [flowVersionId, flowId, storeId], references: [id, flowId, storeId], onDelete: Restrict)",
    );
  });

  it("rejects concurrent or retried active conversations for the same LINE identity", () => {
    const activeIdentityIndex = [
      'CREATE UNIQUE INDEX "DigitalButlerConversation_one_active_identity_key"',
      'ON "DigitalButlerConversation"("storeId", "channelIdentity", "lineUserIdHash")',
      `WHERE "status" IN ('IN_PROGRESS', 'WAITING_INPUT')`,
    ];

    for (const clause of activeIdentityIndex) {
      expect(migration).toContain(clause);
    }

    // Completed, cancelled, and expired rows remain valid history and must not
    // prevent a later conversation for the same store-scoped LINE identity.
    const predicate = migration.slice(
      migration.indexOf(activeIdentityIndex[0]),
      migration.indexOf(";", migration.indexOf(activeIdentityIndex[0])) + 1,
    );
    expect(predicate).not.toMatch(/\b(COMPLETED|CANCELLED|EXPIRED|IDLE)\b/);
  });
});
