import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MESSENGER_CHECKSUM,
  MESSENGER_MIGRATION,
  PAYMENT_SPLIT_CHECKSUM,
  PAYMENT_SPLIT_MIGRATION,
  HUMAN_SUPPORT_SUMMARY_CHECKSUM,
  HUMAN_SUPPORT_SUMMARY_MIGRATION,
  PAYMENT_SPLIT_RLS_CHECKSUM,
  PAYMENT_SPLIT_RLS_MIGRATION,
  TRANSACTION_CONVERSION_SNAPSHOT_CHECKSUM,
  TRANSACTION_CONVERSION_SNAPSHOT_MIGRATION,
  APPROVED_PRODUCTION_MIGRATION_TARGETS,
  PRODUCTION_MIGRATION_TARGET_ENV,
  classifyMessengerMigration,
  hasExpectedMessengerRls,
  hasExpectedMessengerSchema,
  hasExpectedPaymentSplitSchema,
  hasNoPaymentSplitObjects,
  hasOnlyPaymentSplitPending,
  hasOnlyHumanSupportSummaryPending,
  hasOnlyPaymentSplitRlsPending,
  hasOnlyTransactionConversionSnapshotPending,
  hasNoHumanSupportSummaryObjects,
  hasExpectedHumanSupportSummarySchema,
  isAppliedPaymentSplitMigration,
  isAppliedHumanSupportSummaryMigration,
  isAppliedPaymentSplitRlsMigration,
  isAppliedTransactionConversionSnapshotMigration,
  hasNoTransactionConversionSnapshotColumns,
  hasExpectedTransactionConversionSnapshotColumns,
  hasExpectedPaymentSplitRls,
  awaitsManualReconciliation,
  migrationChecksum,
  projectRefFromConnectionString,
  resolveProductionMigrationTarget,
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
const humanSupportSummaryMigration = resolve(
  process.cwd(),
  `prisma/migrations/${HUMAN_SUPPORT_SUMMARY_MIGRATION}/migration.sql`,
);
const paymentSplitRlsMigration = resolve(
  process.cwd(),
  `prisma/migrations/${PAYMENT_SPLIT_RLS_MIGRATION}/migration.sql`,
);
const transactionConversionSnapshotMigration = resolve(
  process.cwd(),
  `prisma/migrations/${TRANSACTION_CONVERSION_SNAPSHOT_MIGRATION}/migration.sql`,
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
  rlsForced: false,
  policyCount: 0,
  clientGrantCount: 0,
};

describe("Production migration recovery guard", () => {
  it("selects the one-shot transaction snapshot target for Production without an env override", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: { ...process.env, VERCEL_ENV: "production", DATABASE_URL: "", DIRECT_URL: "", [PRODUCTION_MIGRATION_TARGET_ENV]: "" },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("production_connection_rejected");
    expect(result.stdout).not.toContain("migration_skipped_no_target");
  });

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

  it("skips Preview even if a migration target is accidentally configured", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: { ...process.env, VERCEL_ENV: "preview", DATABASE_URL: "", DIRECT_URL: "", [PRODUCTION_MIGRATION_TARGET_ENV]: PAYMENT_SPLIT_MIGRATION },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("recovery_skipped_outside_production");
    expect(result.stdout).not.toContain("migration_target_rejected");
  });

  it("rejects every non-allowlisted target before creating a Production connection", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: { ...process.env, VERCEL_ENV: "production", DATABASE_URL: "", DIRECT_URL: "", [PRODUCTION_MIGRATION_TARGET_ENV]: "20269999999999_unapproved" },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("migration_target_rejected");
    expect(result.stderr).not.toContain("production_connection_rejected");
    expect(resolveProductionMigrationTarget("20269999999999_unapproved")).toBeNull();
  });

  it("allows only one exact repository-pinned migration target into the guarded flow", () => {
    expect(APPROVED_PRODUCTION_MIGRATION_TARGETS).toEqual([
      PAYMENT_SPLIT_MIGRATION,
      HUMAN_SUPPORT_SUMMARY_MIGRATION,
      PAYMENT_SPLIT_RLS_MIGRATION,
      TRANSACTION_CONVERSION_SNAPSHOT_MIGRATION,
    ]);
    expect(resolveProductionMigrationTarget(PAYMENT_SPLIT_MIGRATION)).toBe(PAYMENT_SPLIT_MIGRATION);
    expect(resolveProductionMigrationTarget(HUMAN_SUPPORT_SUMMARY_MIGRATION)).toBe(HUMAN_SUPPORT_SUMMARY_MIGRATION);
    expect(resolveProductionMigrationTarget(PAYMENT_SPLIT_RLS_MIGRATION)).toBe(PAYMENT_SPLIT_RLS_MIGRATION);
    expect(resolveProductionMigrationTarget(TRANSACTION_CONVERSION_SNAPSHOT_MIGRATION)).toBe(TRANSACTION_CONVERSION_SNAPSHOT_MIGRATION);

    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: { ...process.env, VERCEL_ENV: "production", DATABASE_URL: "", DIRECT_URL: "", [PRODUCTION_MIGRATION_TARGET_ENV]: PAYMENT_SPLIT_MIGRATION },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("production_connection_rejected");
    expect(result.stderr).not.toContain("migration_target_rejected");
  });

  it("validates only approved Production pooler and direct URLs without logging them", () => {
    const pooler = "postgresql://postgres.qijlnhtpbintanzpxkvf:secret@example:6543/postgres";
    const sessionPooler = "postgresql://postgres.qijlnhtpbintanzpxkvf:secret@example:5432/postgres";
    const direct = "postgresql://postgres:secret@db.qijlnhtpbintanzpxkvf.supabase.co:5432/postgres";
    expect(projectRefFromConnectionString(pooler, "6543")).toBe("qijlnhtpbintanzpxkvf");
    expect(projectRefFromConnectionString(sessionPooler, "5432")).toBe("qijlnhtpbintanzpxkvf");
    expect(projectRefFromConnectionString(direct, "5432")).toBe("qijlnhtpbintanzpxkvf");
    expect(projectRefFromConnectionString(pooler, "5432")).toBeNull();
    expect(projectRefFromConnectionString("postgresql://postgres:secret@db.qijlnhtpbintanzpxkvf.supabase.co:6543/postgres", "5432")).toBeNull();
    expect(projectRefFromConnectionString("postgresql://postgres:secret@db.qijlnhtpbintanzpxkvf.supabase.co.evil.test:5432/postgres", "5432")).toBeNull();
    expect(projectRefFromConnectionString("postgresql://other:secret@db.qijlnhtpbintanzpxkvf.supabase.co:5432/postgres", "5432")).toBeNull();
    expect(projectRefFromConnectionString("postgresql://postgres.other:secret@example:6543/postgres", "6543")).toBe("other");
    expect(script).toContain("production_connection_rejected");
    expect(script).not.toContain("process.stderr.write(output)");
  });

  it("pins both approved migration checksums", () => {
    expect(migrationChecksum(messengerMigration)).toBe(MESSENGER_CHECKSUM);
    expect(migrationChecksum(paymentSplitMigration)).toBe(PAYMENT_SPLIT_CHECKSUM);
    expect(migrationChecksum(humanSupportSummaryMigration)).toBe(HUMAN_SUPPORT_SUMMARY_CHECKSUM);
    expect(migrationChecksum(paymentSplitRlsMigration)).toBe(PAYMENT_SPLIT_RLS_CHECKSUM);
    expect(migrationChecksum(transactionConversionSnapshotMigration)).toBe(TRANSACTION_CONVERSION_SNAPSHOT_CHECKSUM);
  });

  it("supports the applied Messenger path without resolve", () => {
    const applied = { checksum: MESSENGER_CHECKSUM, finishedAt: new Date(), rolledBackAt: null, appliedStepsCount: 0 };
    expect(classifyMessengerMigration(applied, [])).toBe("applied");
    expect(classifyMessengerMigration([
      { checksum: MESSENGER_CHECKSUM, finishedAt: null, rolledBackAt: new Date(), appliedStepsCount: 0, logs: "MessengerAuditStatus already exists" },
      applied,
    ], [])).toBe("applied");
    expect(script).toContain("messenger_state_applied");
  });

  it("allows only the known failed Messenger path to continue the build without migration writes", () => {
    const failed = { checksum: MESSENGER_CHECKSUM, finishedAt: null, rolledBackAt: null, appliedStepsCount: 0, logs: "MessengerAuditStatus already exists" };
    expect(classifyMessengerMigration(failed, [MESSENGER_MIGRATION])).toBe("failed");
    expect(classifyMessengerMigration(failed, [MESSENGER_MIGRATION, "other"])).toBe("invalid");
    expect(awaitsManualReconciliation("failed")).toBe(true);
    expect(awaitsManualReconciliation("applied")).toBe(false);
    const failedBranch = script.slice(script.indexOf('if (messengerState === "failed")'), script.indexOf("} else {", script.indexOf('if (messengerState === "failed")')));
    expect(failedBranch).toContain("manual_reconciliation_required");
    expect(failedBranch).toContain("return;");
    expect(failedBranch).not.toContain("migrate");
  });

  it("rejects Messenger checksum, rollback, partial-apply, and unrelated failed states", () => {
    expect(classifyMessengerMigration({ checksum: "wrong", finishedAt: new Date(), rolledBackAt: null }, [])).toBe("invalid");
    expect(classifyMessengerMigration({ checksum: MESSENGER_CHECKSUM, finishedAt: null, rolledBackAt: null, appliedStepsCount: 1, logs: "MessengerAuditStatus" }, [MESSENGER_MIGRATION])).toBe("invalid");
    expect(classifyMessengerMigration({ checksum: MESSENGER_CHECKSUM, finishedAt: new Date(), rolledBackAt: new Date() }, [])).toBe("invalid");
    const applied = { checksum: MESSENGER_CHECKSUM, finishedAt: new Date(), rolledBackAt: null, appliedStepsCount: 0 };
    const rolledBack = { checksum: MESSENGER_CHECKSUM, finishedAt: null, rolledBackAt: new Date(), appliedStepsCount: 0, logs: "MessengerAuditStatus already exists" };
    expect(classifyMessengerMigration([rolledBack, applied, rolledBack], [])).toBe("invalid");
    expect(classifyMessengerMigration([{ ...rolledBack, checksum: "wrong" }, applied], [])).toBe("invalid");
    expect(classifyMessengerMigration([{ ...rolledBack, appliedStepsCount: 1 }, applied], [])).toBe("invalid");
    expect(classifyMessengerMigration([rolledBack, applied], [MESSENGER_MIGRATION])).toBe("invalid");
  });

  it("requires the complete Messenger schema independently of its safe RLS phase", () => {
    expect(hasExpectedMessengerSchema(completeMessengerSnapshot)).toBe(true);
    expect(hasExpectedMessengerSchema({ ...completeMessengerSnapshot, rlsEnabled: true })).toBe(true);
    expect(hasExpectedMessengerSchema({ ...completeMessengerSnapshot, enumValues: ["RUNNING"] })).toBe(false);
    expect(hasExpectedMessengerSchema({ ...completeMessengerSnapshot, columns: completeMessengerSnapshot.columns.slice(1) })).toBe(false);
    expect(hasExpectedMessengerSchema({ ...completeMessengerSnapshot, foreignKeys: ["MessengerAuditRun_storeId_fkey"] })).toBe(false);
    expect(hasExpectedMessengerSchema({ ...completeMessengerSnapshot, indexes: ["MessengerAuditRun_storeId_createdAt_idx"] })).toBe(false);
    expect(script).toContain("messenger_rls_rejected");
  });

  it("accepts only the exact pre-repair or repaired server-only RLS state", () => {
    expect(hasExpectedMessengerRls(completeMessengerSnapshot)).toBe(true);
    expect(hasExpectedMessengerRls({
      ...completeMessengerSnapshot,
      rlsEnabled: true,
      rlsForced: true,
    })).toBe(true);
    expect(hasExpectedMessengerRls({ ...completeMessengerSnapshot, rlsEnabled: true })).toBe(false);
    expect(hasExpectedMessengerRls({ ...completeMessengerSnapshot, rlsForced: true })).toBe(false);
    expect(hasExpectedMessengerRls({ ...completeMessengerSnapshot, policyCount: 1 })).toBe(false);
    expect(hasExpectedMessengerRls({ ...completeMessengerSnapshot, clientGrantCount: 1 })).toBe(false);
  });

  it("allows only payment split as the pending migration", () => {
    const onlyPayment = `${PENDING}\n${PAYMENT_SPLIT_MIGRATION}\n`;
    expect(hasOnlyPaymentSplitPending(onlyPayment)).toBe(true);
    expect(hasOnlyPaymentSplitPending(`${PENDING_SINGULAR}\n${PAYMENT_SPLIT_MIGRATION}\n`)).toBe(true);
    expect(hasOnlyPaymentSplitPending(`${onlyPayment}${MESSENGER_MIGRATION}\n`)).toBe(false);
    expect(hasOnlyPaymentSplitPending(`${onlyPayment}20260901090000_unapproved\n`)).toBe(false);
  });

  it("allows only the fixed human-support summary migration in its independent path", () => {
    const onlyHumanSupport = `${PENDING}\n${HUMAN_SUPPORT_SUMMARY_MIGRATION}\n`;
    expect(hasOnlyHumanSupportSummaryPending(onlyHumanSupport)).toBe(true);
    expect(hasOnlyHumanSupportSummaryPending(`${PENDING_SINGULAR}\n${HUMAN_SUPPORT_SUMMARY_MIGRATION}\n`)).toBe(true);
    expect(hasOnlyHumanSupportSummaryPending(`${onlyHumanSupport}${PAYMENT_SPLIT_MIGRATION}\n`)).toBe(false);
    expect(hasOnlyHumanSupportSummaryPending(`${onlyHumanSupport}20260901090000_unapproved\n`)).toBe(false);
  });

  it("allows only the fixed payment-split RLS migration in its independent path", () => {
    const onlyRls = `${PENDING}\n${PAYMENT_SPLIT_RLS_MIGRATION}\n`;
    expect(hasOnlyPaymentSplitRlsPending(onlyRls)).toBe(true);
    expect(hasOnlyPaymentSplitRlsPending(`${PENDING_SINGULAR}\n${PAYMENT_SPLIT_RLS_MIGRATION}\n`)).toBe(true);
    expect(hasOnlyPaymentSplitRlsPending(`${onlyRls}${PAYMENT_SPLIT_MIGRATION}\n`)).toBe(false);
    expect(hasOnlyPaymentSplitRlsPending(`${onlyRls}20260901090000_unapproved\n`)).toBe(false);
  });

  it("allows and fingerprints only the transaction conversion snapshot migration", () => {
    const onlySnapshot = `${PENDING}\n${TRANSACTION_CONVERSION_SNAPSHOT_MIGRATION}\n`;
    expect(hasOnlyTransactionConversionSnapshotPending(onlySnapshot)).toBe(true);
    expect(hasOnlyTransactionConversionSnapshotPending(`${onlySnapshot}${PAYMENT_SPLIT_MIGRATION}\n`)).toBe(false);
    expect(isAppliedTransactionConversionSnapshotMigration({
      checksum: TRANSACTION_CONVERSION_SNAPSHOT_CHECKSUM,
      finishedAt: new Date(),
      rolledBackAt: null,
    })).toBe(true);
    expect(isAppliedTransactionConversionSnapshotMigration({
      checksum: "wrong",
      finishedAt: new Date(),
      rolledBackAt: null,
    })).toBe(false);

    const columns = [
      ["conversionEffectsApplied", "boolean", "bool", "NO", "false"],
      ["conversionSnapshotCaptured", "boolean", "bool", "NO", "false"],
      ["firstTopupRewardsApplied", "boolean", "bool", "NO", "false"],
      ["firstTopupReferrerRewardApplied", "boolean", "bool", "NO", "false"],
      ["firstTopupSelfRewardApplied", "boolean", "bool", "NO", "false"],
      ["preConversionCustomerStage", "USER-DEFINED", "CustomerStage", "YES", null],
      ["preConversionSelfBookingEnabled", "boolean", "bool", "YES", null],
      ["preConversionConvertedAt", "timestamp without time zone", "timestamp", "YES", null],
      ["conversionAppliedConvertedAt", "timestamp without time zone", "timestamp", "YES", null],
    ].map(([columnName, dataType, udtName, isNullable, columnDefault]) => ({
      columnName, dataType, udtName, isNullable, columnDefault,
    }));
    expect(hasNoTransactionConversionSnapshotColumns([])).toBe(true);
    expect(hasNoTransactionConversionSnapshotColumns(columns.slice(0, 1))).toBe(false);
    expect(hasExpectedTransactionConversionSnapshotColumns(columns)).toBe(true);
    expect(hasExpectedTransactionConversionSnapshotColumns(columns.slice(1))).toBe(false);
    expect(hasExpectedTransactionConversionSnapshotColumns(columns.map((column) =>
      column.columnName === "conversionEffectsApplied" ? { ...column, columnDefault: "true" } : column
    ))).toBe(false);
    expect(hasExpectedTransactionConversionSnapshotColumns(columns.map((column) =>
      column.columnName === "preConversionSelfBookingEnabled" ? { ...column, columnDefault: "true" } : column
    ))).toBe(false);
  });

  it("pins the exact payment-split RLS preflight and final states", () => {
    const baseline = { rlsEnabled: false, rlsForced: false, policyCount: 0, clientGrantCount: 0 };
    expect(hasExpectedPaymentSplitRls(baseline, false)).toBe(true);
    expect(hasExpectedPaymentSplitRls({ ...baseline, rlsEnabled: true }, true)).toBe(true);
    expect(hasExpectedPaymentSplitRls({ ...baseline, rlsForced: true }, false)).toBe(false);
    expect(hasExpectedPaymentSplitRls({ ...baseline, policyCount: 1 }, false)).toBe(false);
    expect(hasExpectedPaymentSplitRls({ ...baseline, clientGrantCount: 1 }, false)).toBe(false);
    expect(isAppliedPaymentSplitRlsMigration({ checksum: PAYMENT_SPLIT_RLS_CHECKSUM, finishedAt: new Date(), rolledBackAt: null })).toBe(true);
    expect(isAppliedPaymentSplitRlsMigration({ checksum: PAYMENT_SPLIT_RLS_CHECKSUM, finishedAt: null, rolledBackAt: null })).toBe(false);
  });

  it("rejects partial human-support schema and verifies its exact final shape", () => {
    const absent = { columns: [], indexes: [] };
    const columns = [
      ["customerDisplayName", "text", "text"],
      ["customerAvatarUrl", "text", "text"],
      ["customerReference", "text", "text"],
      ["lastMessageCiphertext", "bytea", "bytea"],
      ["lastMessageIv", "bytea", "bytea"],
      ["lastMessageAuthTag", "bytea", "bytea"],
      ["lastMessageAt", "timestamp without time zone", "timestamp"],
    ].map(([columnName, dataType, udtName]) => ({
      columnName, dataType, udtName, isNullable: "YES", columnDefault: null,
    }));
    const complete = {
      columns,
      indexes: [{
        name: "DigitalButlerLead_handoff_lookup_idx",
        isUnique: false,
        columns: ["storeId", "completionActionKey", "assignedStaffId"],
      }],
    };
    expect(hasNoHumanSupportSummaryObjects(absent)).toBe(true);
    expect(hasNoHumanSupportSummaryObjects({ ...absent, columns: columns.slice(0, 1) })).toBe(false);
    expect(hasNoHumanSupportSummaryObjects({ ...absent, indexes: complete.indexes })).toBe(false);
    expect(hasExpectedHumanSupportSummarySchema(complete)).toBe(true);
    expect(hasExpectedHumanSupportSummarySchema({ ...complete, columns: columns.slice(1) })).toBe(false);
    expect(hasExpectedHumanSupportSummarySchema({ ...complete, indexes: [{ ...complete.indexes[0], isUnique: true }] })).toBe(false);
    expect(hasExpectedHumanSupportSummarySchema({ ...complete, indexes: [{ ...complete.indexes[0], columns: ["storeId"] }] })).toBe(false);
    expect(hasExpectedHumanSupportSummarySchema({ ...complete, indexes: [{ ...complete.indexes[0], columns: [...complete.indexes[0].columns].reverse() }] })).toBe(false);
    expect(isAppliedHumanSupportSummaryMigration({ checksum: HUMAN_SUPPORT_SUMMARY_CHECKSUM, finishedAt: new Date(), rolledBackAt: null })).toBe(true);
    expect(isAppliedHumanSupportSummaryMigration({ checksum: HUMAN_SUPPORT_SUMMARY_CHECKSUM, finishedAt: null, rolledBackAt: null })).toBe(false);
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
    expect(script).toContain("migration_skipped_no_target");
    expect(script).toContain("migration_target_rejected");
    expect(script).toContain("human_support_preflight_verified");
    expect(script).toContain("human_support_final_schema_verified");
    expect(script).toContain("human_support_already_applied_verified");
    expect(script).toContain("payment_split_rls_preflight_verified");
    expect(script).toContain("payment_split_rls_final_schema_verified");
    expect(script).toContain("payment_split_rls_already_applied_verified");
  });
});

const PENDING = "Following migrations have not yet been applied:";
const PENDING_SINGULAR = "Following migration have not yet been applied:";
