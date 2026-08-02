import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPECTED_FAILED_CHECKSUM,
  MESSENGER_MIGRATION,
  PAYMENT_SPLIT_MIGRATION,
  hasExpectedFailedMigration,
  hasExpectedMigrationLedger,
  hasExpectedMessengerSchema,
  hasOnlyPaymentSplitPending,
  migrationChecksum,
} from "../../scripts/reconcile-messenger-migration.mjs";
import {
  PAYMENT_SPLIT_MIGRATION as PHASE_TWO_MIGRATION,
  hasOnlyPaymentSplitPending as phaseTwoHasOnlyPaymentSplitPending,
} from "../../scripts/ci-payment-split-migrate.mjs";

const script = readFileSync(
  resolve(process.cwd(), "scripts/reconcile-messenger-migration.mjs"),
  "utf8",
);
const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260729090000_add_messenger_audit_runs/migration.sql",
  ),
  "utf8",
);

describe("Messenger Production migration reconciliation", () => {
  it("is a fixed, Production-only tool with no user arguments", () => {
    expect(script).toContain('const EXPECTED_ENVIRONMENT = "production"');
    expect(script).toContain("process.argv.length !== 2");
    expect(script).toContain(MESSENGER_MIGRATION);
    expect(script).toContain('"6543"');
    expect(script).toContain('"5432"');
  });

  it("matches the recorded immutable migration checksum and stops on changes", () => {
    expect(migrationChecksum()).toBe(EXPECTED_FAILED_CHECKSUM);
    const altered = createHash("sha256").update("altered migration").digest("hex");
    expect(altered).not.toBe(EXPECTED_FAILED_CHECKSUM);
    expect(migrationSql).not.toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("requires the expected failed migration state", () => {
    expect(
      hasExpectedFailedMigration(
        `The ${MESSENGER_MIGRATION} migration failed to apply.`,
      ),
    ).toBe(true);
    expect(hasExpectedFailedMigration("Database schema is up to date")).toBe(false);
    expect(
      hasExpectedMigrationLedger(
        [
          {
            migrationName: MESSENGER_MIGRATION,
            checksum: EXPECTED_FAILED_CHECKSUM,
            finishedAt: null,
            rolledBackAt: null,
            appliedStepsCount: 0,
            logs: "MessengerAuditStatus already exists",
          },
        ],
        [MESSENGER_MIGRATION],
      ),
    ).toBe(true);
    expect(
      hasExpectedMigrationLedger(
        [
          {
            migrationName: MESSENGER_MIGRATION,
            checksum: EXPECTED_FAILED_CHECKSUM,
            finishedAt: null,
            rolledBackAt: null,
            appliedStepsCount: 1,
            logs: "MessengerAuditStatus already exists",
          },
        ],
        [MESSENGER_MIGRATION],
      ),
    ).toBe(false);
    expect(
      hasExpectedMigrationLedger([], [MESSENGER_MIGRATION, "unexpected"]),
    ).toBe(false);
  });

  it("stops when introspected Messenger schema is incomplete", () => {
    expect(hasExpectedMessengerSchema("model MessengerAuditRun {} ")).toBe(false);
  });

  it("allows exactly one payment-split migration after reconciliation", () => {
    const onlyPayment = `Following migrations have not yet been applied:\n${PAYMENT_SPLIT_MIGRATION}\n`;
    expect(hasOnlyPaymentSplitPending(onlyPayment)).toBe(true);
    const additionalPending = `${onlyPayment}${MESSENGER_MIGRATION}\n`;
    expect(hasOnlyPaymentSplitPending(additionalPending)).toBe(false);
    expect(phaseTwoHasOnlyPaymentSplitPending(onlyPayment)).toBe(true);
    expect(phaseTwoHasOnlyPaymentSplitPending(additionalPending)).toBe(false);
    expect(PHASE_TWO_MIGRATION).toBe(PAYMENT_SPLIT_MIGRATION);
  });

  it("does not use manual SQL or deploy the payment split", () => {
    expect(script).not.toContain("$executeRaw");
    expect(script).not.toContain("db execute");
    expect(script).not.toContain("ALTER TABLE");
    expect(script).not.toContain('runPrisma(["migrate", "deploy"])');
  });

  it("keeps the independent phase-two guard out of the build hook", () => {
    const packageJson = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
    const phaseTwoScript = readFileSync(
      resolve(process.cwd(), "scripts/ci-payment-split-migrate.mjs"),
      "utf8",
    );

    expect(packageJson).not.toContain("ci-payment-split-migrate");
    expect(phaseTwoScript).toContain('runPrisma(["migrate", "deploy"])');
    expect(phaseTwoScript).toContain("expected exactly one pending payment-split migration");
  });
});
