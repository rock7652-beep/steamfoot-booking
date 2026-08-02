import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MESSENGER_CHECKSUM,
  MESSENGER_MIGRATION,
  PAYMENT_SPLIT_CHECKSUM,
  PAYMENT_SPLIT_MIGRATION,
  classifyMessengerMigration,
  hasExpectedMessengerSchema,
  hasExpectedPaymentSplitSchema,
  hasNoPaymentSplitObjects,
  hasOnlyPaymentSplitPending,
  isAppliedPaymentSplitMigration,
  migrationChecksum,
  projectRefFromConnectionString,
} from "../../scripts/ci-migrate.mjs";

const scriptPath = resolve(process.cwd(), "scripts/ci-migrate.mjs");
const script = readFileSync(scriptPath, "utf8");
const messengerMigration = resolve(
  process.cwd(),
  `prisma/migrations/${MESSENGER_MIGRATION}/migration.sql`,
);
const paymentSplitMigration = resolve(
  process.cwd(),
  `prisma/migrations/${PAYMENT_SPLIT_MIGRATION}/migration.sql`,
);
const completeMessengerSnapshot = {
  enumValues: ["RUNNING", "COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED"],
  columns: [
    ["id", "text", "text", "NO", null], ["storeId", "text", "text", "NO", null],
    ["requestedByUserId", "text", "text", "NO", null], ["createdAt", "timestamp without time zone", "timestamp", "NO", "CURRENT_TIMESTAMP"],
    ["completedAt", "timestamp without time zone", "timestamp", "YES", null], ["status", "USER-DEFINED", "MessengerAuditStatus", "NO", "'RUNNING'::\"MessengerAuditStatus\""],
    ["appValidated", "boolean", "bool", "YES", null], ["pageTokenMatches", "boolean", "bool", "YES", null],
    ["callbackMatches", "boolean", "bool", "YES", null], ["configuredFields", "ARRAY", "_text", "NO", "ARRAY[]::text[]"],
    ["missingFields", "ARRAY", "_text", "NO", "ARRAY[]::text[]"], ["pageAttached", "boolean", "bool", "YES", null],
    ["callsSafeSummary", "jsonb", "jsonb", "YES", null], ["errorCode", "text", "text", "YES", null],
  ].map(([columnName, dataType, udtName, isNullable, columnDefault]) => ({ columnName, dataType, udtName, isNullable, columnDefault })),
  primaryKey: "MessengerAuditRun_pkey",
  foreignKeys: ["MessengerAuditRun_requestedByUserId_fkey", "MessengerAuditRun_storeId_fkey"],
  indexes: ["MessengerAuditRun_requestedByUserId_createdAt_idx", "MessengerAuditRun_storeId_createdAt_idx"],
  rlsEnabled: false,
};

describe("Production migration recovery guard", () => {
  it("skips Preview and Development before accessing any database", () => {
    for (const environment of ["preview", "development"]) {
      const result = spawnSync(process.execPath, [scriptPath], {
        encoding: "utf8",
        env: { ...process.env, VERCEL_ENV: environment, DATABASE_URL: "", DIRECT_URL: "" },
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("recovery_skipped_outside_production");
    }
  });

  it("validates only approved Production pooler and direct URLs without logging them", () => {
    const pooler = "postgresql://postgres.qijlnhtpbintanzpxkvf:secret@example:6543/postgres";
    const direct = "postgresql://postgres.qijlnhtpbintanzpxkvf:secret@example:5432/postgres";
    expect(projectRefFromConnectionString(pooler, "6543")).toBe("qijlnhtpbintanzpxkvf");
    expect(projectRefFromConnectionString(direct, "5432")).toBe("qijlnhtpbintanzpxkvf");
    expect(projectRefFromConnectionString(pooler, "5432")).toBeNull();
    expect(projectRefFromConnectionString("postgresql://postgres.other:secret@example:6543/postgres", "6543")).toBe("other");
    expect(script).toContain("production_connection_rejected");
    expect(script).not.toContain("process.stderr.write(output)");
  });

  it("pins both approved migration checksums", () => {
    expect(migrationChecksum(messengerMigration)).toBe(MESSENGER_CHECKSUM);
    expect(migrationChecksum(paymentSplitMigration)).toBe(PAYMENT_SPLIT_CHECKSUM);
  });

  it("supports the applied Messenger path without resolve", () => {
    expect(classifyMessengerMigration({ checksum: MESSENGER_CHECKSUM, finishedAt: new Date(), rolledBackAt: null }, [])).toBe("applied");
    expect(script).toContain("messenger_state_applied");
  });

  it("supports only the known failed Messenger path before resolve", () => {
    const failed = { checksum: MESSENGER_CHECKSUM, finishedAt: null, rolledBackAt: null, appliedStepsCount: 0, logs: "MessengerAuditStatus already exists" };
    expect(classifyMessengerMigration(failed, [MESSENGER_MIGRATION])).toBe("failed");
    expect(classifyMessengerMigration(failed, [MESSENGER_MIGRATION, "other"])).toBe("invalid");
    expect(script).toContain('runPrisma(["migrate", "resolve", "--applied", MESSENGER_MIGRATION])');
    expect(script).toContain("messenger_resolve_verification_failed");
  });

  it("rejects Messenger checksum, rollback, partial-apply, and unrelated failed states", () => {
    expect(classifyMessengerMigration({ checksum: "wrong", finishedAt: new Date(), rolledBackAt: null }, [])).toBe("invalid");
    expect(classifyMessengerMigration({ checksum: MESSENGER_CHECKSUM, finishedAt: null, rolledBackAt: null, appliedStepsCount: 1, logs: "MessengerAuditStatus" }, [MESSENGER_MIGRATION])).toBe("invalid");
    expect(classifyMessengerMigration({ checksum: MESSENGER_CHECKSUM, finishedAt: new Date(), rolledBackAt: new Date() }, [])).toBe("invalid");
  });

  it("requires the complete pre-recovery Messenger schema and disabled RLS", () => {
    expect(hasExpectedMessengerSchema(completeMessengerSnapshot)).toBe(true);
    expect(hasExpectedMessengerSchema({ ...completeMessengerSnapshot, rlsEnabled: true })).toBe(false);
    expect(hasExpectedMessengerSchema({ ...completeMessengerSnapshot, enumValues: ["RUNNING"] })).toBe(false);
    expect(hasExpectedMessengerSchema({ ...completeMessengerSnapshot, columns: completeMessengerSnapshot.columns.slice(1) })).toBe(false);
    expect(hasExpectedMessengerSchema({ ...completeMessengerSnapshot, foreignKeys: ["MessengerAuditRun_storeId_fkey"] })).toBe(false);
    expect(hasExpectedMessengerSchema({ ...completeMessengerSnapshot, indexes: ["MessengerAuditRun_storeId_createdAt_idx"] })).toBe(false);
    expect(script).toContain("messenger_rls_rejected");
  });

  it("allows only payment split as the pending migration", () => {
    const onlyPayment = `${PENDING}\n${PAYMENT_SPLIT_MIGRATION}\n`;
    expect(hasOnlyPaymentSplitPending(onlyPayment)).toBe(true);
    expect(hasOnlyPaymentSplitPending(`${onlyPayment}${MESSENGER_MIGRATION}\n`)).toBe(false);
    expect(hasOnlyPaymentSplitPending(`${onlyPayment}20260901090000_unapproved\n`)).toBe(false);
  });

  it("rejects existing or partial payment-split objects and verifies the final shape", () => {
    const absent = { tableExists: false, columns: [], constraints: [], indexes: [], paymentMethodValues: ["CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD", "OTHER", "UNPAID"] };
    expect(hasNoPaymentSplitObjects(absent)).toBe(true);
    expect(hasNoPaymentSplitObjects({ ...absent, tableExists: true })).toBe(false);
    expect(hasNoPaymentSplitObjects({ ...absent, constraints: ["TransactionPaymentSplit_pkey"] })).toBe(false);
    expect(hasExpectedPaymentSplitSchema({ tableExists: true, columns: [
      { columnName: "id", dataType: "text", udtName: "text", isNullable: "NO", columnDefault: null },
      { columnName: "transactionId", dataType: "text", udtName: "text", isNullable: "NO", columnDefault: null },
      { columnName: "paymentMethod", dataType: "USER-DEFINED", udtName: "PaymentMethod", isNullable: "NO", columnDefault: null },
      { columnName: "amount", dataType: "numeric", udtName: "numeric", isNullable: "NO", columnDefault: null },
      { columnName: "createdAt", dataType: "timestamp without time zone", udtName: "timestamp", isNullable: "NO", columnDefault: "CURRENT_TIMESTAMP" },
    ], constraints: ["TransactionPaymentSplit_pkey", "TransactionPaymentSplit_transactionId_fkey"], indexes: ["TransactionPaymentSplit_paymentMethod_idx", "TransactionPaymentSplit_transactionId_idx"] })).toBe(true);
    expect(isAppliedPaymentSplitMigration({ checksum: PAYMENT_SPLIT_CHECKSUM, finishedAt: new Date(), rolledBackAt: null })).toBe(true);
    expect(isAppliedPaymentSplitMigration({ checksum: PAYMENT_SPLIT_CHECKSUM, finishedAt: null, rolledBackAt: null })).toBe(false);
  });

  it("uses fixed commands, verifies the final status, and emits only safe event names", () => {
    expect(script).toContain('runPrisma(["migrate", "deploy"])');
    expect(script).toContain("recovery_final_status_verified");
    expect(script).toContain("isStatusUpToDate(initialStatus)");
    expect(script).toContain("recovery_aborted code=");
    expect(script).not.toContain("$executeRaw");
    expect(script).not.toContain("db execute");
  });
});

const PENDING = "Following migrations have not yet been applied:";
