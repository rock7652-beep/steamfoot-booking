import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const EXPECTED_ENVIRONMENT = "production";
const EXPECTED_PROJECT_REF = "qijlnhtpbintanzpxkvf";
export const MESSENGER_MIGRATION =
  "20260729090000_add_messenger_audit_runs";
export const PAYMENT_SPLIT_MIGRATION =
  "20260801090000_add_transaction_payment_splits";
export const HUMAN_SUPPORT_SUMMARY_MIGRATION =
  "20260802090000_add_digital_butler_human_support_summary";
export const PRODUCTION_MIGRATION_TARGET_ENV = "PRODUCTION_MIGRATION_TARGET";
export const APPROVED_PRODUCTION_MIGRATION_TARGETS = [
  PAYMENT_SPLIT_MIGRATION,
  HUMAN_SUPPORT_SUMMARY_MIGRATION,
];
export const MESSENGER_CHECKSUM =
  "6edbd88d9fd2ab9e368b963d21f7d90ef2ed1f8e8c467a29c20f9a3c8d8e1488";
export const PAYMENT_SPLIT_CHECKSUM =
  "74750d2d3f24dba84a4f58380a8ed9868734500ddd50e8d632d223cefeb07287";
export const HUMAN_SUPPORT_SUMMARY_CHECKSUM =
  "9218b485f642748141666778d7643bc5ba1aee27541ae8dc17461dacd3884ad5";
const PENDING_MIGRATIONS_HEADER =
  /Following migrations? have not yet been applied:/;
const MESSENGER_MIGRATION_FILE =
  `prisma/migrations/${MESSENGER_MIGRATION}/migration.sql`;
const PAYMENT_SPLIT_MIGRATION_FILE =
  `prisma/migrations/${PAYMENT_SPLIT_MIGRATION}/migration.sql`;
const HUMAN_SUPPORT_SUMMARY_MIGRATION_FILE =
  `prisma/migrations/${HUMAN_SUPPORT_SUMMARY_MIGRATION}/migration.sql`;

const expectedMessengerColumns = [
  ["id", "text", "text", "NO", null],
  ["storeId", "text", "text", "NO", null],
  ["requestedByUserId", "text", "text", "NO", null],
  ["createdAt", "timestamp without time zone", "timestamp", "NO", "CURRENT_TIMESTAMP"],
  ["completedAt", "timestamp without time zone", "timestamp", "YES", null],
  ["status", "USER-DEFINED", "MessengerAuditStatus", "NO", "'RUNNING'::\"MessengerAuditStatus\""],
  ["appValidated", "boolean", "bool", "YES", null],
  ["pageTokenMatches", "boolean", "bool", "YES", null],
  ["callbackMatches", "boolean", "bool", "YES", null],
  ["configuredFields", "ARRAY", "_text", "NO", "ARRAY[]::text[]"],
  ["missingFields", "ARRAY", "_text", "NO", "ARRAY[]::text[]"],
  ["pageAttached", "boolean", "bool", "YES", null],
  ["callsSafeSummary", "jsonb", "jsonb", "YES", null],
  ["errorCode", "text", "text", "YES", null],
];
const expectedPaymentMethodValues = [
  "CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD", "OTHER", "UNPAID",
];
const expectedMessengerForeignKeys = [
  "MessengerAuditRun_requestedByUserId_fkey",
  "MessengerAuditRun_storeId_fkey",
];
const expectedMessengerIndexes = [
  "MessengerAuditRun_requestedByUserId_createdAt_idx",
  "MessengerAuditRun_storeId_createdAt_idx",
];
const expectedPaymentSplitConstraints = [
  "TransactionPaymentSplit_pkey",
  "TransactionPaymentSplit_transactionId_fkey",
];
const expectedPaymentSplitIndexes = [
  "TransactionPaymentSplit_paymentMethod_idx",
  "TransactionPaymentSplit_transactionId_idx",
];
const expectedPaymentSplitColumns = [
  ["id", "text", "text", "NO", null],
  ["transactionId", "text", "text", "NO", null],
  ["paymentMethod", "USER-DEFINED", "PaymentMethod", "NO", null],
  ["amount", "numeric", "numeric", "NO", null],
  ["createdAt", "timestamp without time zone", "timestamp", "NO", "CURRENT_TIMESTAMP"],
];
const expectedHumanSupportSummaryColumns = [
  ["customerDisplayName", "text", "text", "YES", null],
  ["customerAvatarUrl", "text", "text", "YES", null],
  ["customerReference", "text", "text", "YES", null],
  ["lastMessageCiphertext", "bytea", "bytea", "YES", null],
  ["lastMessageIv", "bytea", "bytea", "YES", null],
  ["lastMessageAuthTag", "bytea", "bytea", "YES", null],
  ["lastMessageAt", "timestamp without time zone", "timestamp", "YES", null],
];
const HUMAN_SUPPORT_SUMMARY_INDEX =
  "DigitalButlerLead_handoff_lookup_idx";
const expectedHumanSupportSummaryIndexColumns = [
  "storeId", "completionActionKey", "assignedStaffId",
];

function log(event) {
  console.log(`ci-migrate: ${event}`);
}

function abort(code) {
  console.error(`ci-migrate: recovery_aborted code=${code}`);
  process.exit(1);
}

export function projectRefFromConnectionString(value, expectedPort) {
  if (!value) return null;

  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.port !== expectedPort) {
    return null;
  }

  const poolerMatch = url.username.match(/^postgres\.([a-z0-9]+)$/);
  if (poolerMatch) return poolerMatch[1];

  if (url.username !== "postgres") return null;
  const directHostMatch = url.hostname.match(
    /^db\.([a-z0-9]+)\.supabase\.co$/,
  );
  return directHostMatch?.[1] ?? null;
}

function assertProductionConnection() {
  const databaseRef = projectRefFromConnectionString(
    process.env.DATABASE_URL,
    "6543",
  );
  const directRef = projectRefFromConnectionString(
    process.env.DIRECT_URL,
    "5432",
  );
  if (
    databaseRef !== EXPECTED_PROJECT_REF ||
    directRef !== EXPECTED_PROJECT_REF
  ) {
    abort("production_connection_rejected");
  }
  log("production_connection_verified");
}

/** Production builds are database-free unless deployment config names one exact approved migration. */
export function resolveProductionMigrationTarget(value) {
  if (!value) return null;
  return APPROVED_PRODUCTION_MIGRATION_TARGETS.includes(value) ? value : null;
}

function assertApprovedMigrationTarget(value) {
  if (!resolveProductionMigrationTarget(value)) {
    abort("migration_target_rejected");
  }
  const targetFile = value === PAYMENT_SPLIT_MIGRATION
    ? PAYMENT_SPLIT_MIGRATION_FILE
    : HUMAN_SUPPORT_SUMMARY_MIGRATION_FILE;
  const targetChecksum = value === PAYMENT_SPLIT_MIGRATION
    ? PAYMENT_SPLIT_CHECKSUM
    : HUMAN_SUPPORT_SUMMARY_CHECKSUM;
  if (migrationChecksum(targetFile) !== targetChecksum) {
    abort("migration_target_checksum_mismatch");
  }
}

function runPrisma(args) {
  try {
    return {
      exitCode: 0,
      output: execFileSync("npx", ["prisma", ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (error) {
    return {
      exitCode: error.status ?? 1,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

export function migrationChecksum(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function pendingMigrations(statusOutput) {
  const header = statusOutput.match(PENDING_MIGRATIONS_HEADER);
  if (!header || header.index === undefined) return [];

  const pendingSection = statusOutput.slice(
    header.index + header[0].length,
  );
  return pendingSection
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d{14}_[A-Za-z0-9_-]+$/.test(line));
}

export function hasOnlyPaymentSplitPending(statusOutput) {
  const pending = pendingMigrations(statusOutput);
  return pending.length === 1 && pending[0] === PAYMENT_SPLIT_MIGRATION;
}

export function hasOnlyHumanSupportSummaryPending(statusOutput) {
  const pending = pendingMigrations(statusOutput);
  return pending.length === 1 && pending[0] === HUMAN_SUPPORT_SUMMARY_MIGRATION;
}

export function classifyMessengerMigration(input, failedMigrationNames) {
  const rows = (Array.isArray(input) ? input : [input]).filter(Boolean);
  if (rows.length === 0 || rows.some((row) => row.checksum !== MESSENGER_CHECKSUM)) {
    return "invalid";
  }

  const activeRows = rows.filter((row) => row.rolledBackAt === null);
  const rolledBackRows = rows.filter((row) => row.rolledBackAt !== null);
  if (activeRows.length !== 1 || rolledBackRows.length > 1) return "invalid";

  const row = activeRows[0];
  const validRolledBackHistory = rolledBackRows.length === 0 || (
    rolledBackRows[0].finishedAt === null &&
    rolledBackRows[0].appliedStepsCount === 0 &&
    rolledBackRows[0].logs?.includes("MessengerAuditStatus")
  );
  if (!validRolledBackHistory) return "invalid";

  if (
    row.finishedAt !== null &&
    failedMigrationNames.length === 0 &&
    row.appliedStepsCount === 0
  ) return "applied";
  if (
    rolledBackRows.length === 0 &&
    row.finishedAt === null &&
    row.appliedStepsCount === 0 &&
    row.logs?.includes("MessengerAuditStatus") &&
    failedMigrationNames.length === 1 &&
    failedMigrationNames[0] === MESSENGER_MIGRATION
  ) {
    return "failed";
  }
  return "invalid";
}

export function awaitsManualReconciliation(state) {
  return state === "failed";
}

function normalizeDefault(value) {
  return value?.replaceAll(" ", "") ?? null;
}

export function hasExpectedMessengerSchema(snapshot) {
  if (snapshot.enumValues.join("|") !== "RUNNING|COMPLETED|COMPLETED_WITH_ERRORS|FAILED") {
    return false;
  }
  if (snapshot.columns.length !== expectedMessengerColumns.length) return false;

  const columnsMatch = expectedMessengerColumns.every((expected, index) => {
    const actual = snapshot.columns[index];
    return actual &&
      actual.columnName === expected[0] &&
      actual.dataType === expected[1] &&
      actual.udtName === expected[2] &&
      actual.isNullable === expected[3] &&
      normalizeDefault(actual.columnDefault) === normalizeDefault(expected[4]);
  });
  return columnsMatch &&
    snapshot.primaryKey === "MessengerAuditRun_pkey" &&
    sameValues(snapshot.foreignKeys, expectedMessengerForeignKeys) &&
    sameValues(snapshot.indexes, expectedMessengerIndexes);
}

export function hasExpectedMessengerRls(snapshot) {
  const disabledBaseline =
    snapshot.rlsEnabled === false && snapshot.rlsForced === false;
  const repairedServerOnly =
    snapshot.rlsEnabled === true && snapshot.rlsForced === true;
  return (disabledBaseline || repairedServerOnly) &&
    snapshot.policyCount === 0 &&
    snapshot.clientGrantCount === 0;
}

export function hasNoPaymentSplitObjects(snapshot) {
  return snapshot.tableExists === false &&
    snapshot.columns.length === 0 &&
    snapshot.constraints.length === 0 &&
    snapshot.indexes.length === 0 &&
    sameValues(snapshot.paymentMethodValues, expectedPaymentMethodValues);
}

export function hasExpectedPaymentSplitSchema(snapshot) {
  const columnsMatch = snapshot.columns.length === expectedPaymentSplitColumns.length &&
    expectedPaymentSplitColumns.every((expected, index) => {
      const actual = snapshot.columns[index];
      return actual &&
        actual.columnName === expected[0] &&
        actual.dataType === expected[1] &&
        actual.udtName === expected[2] &&
        actual.isNullable === expected[3] &&
        normalizeDefault(actual.columnDefault) === normalizeDefault(expected[4]);
    });
  return snapshot.tableExists === true &&
    columnsMatch &&
    sameValues(snapshot.constraints, expectedPaymentSplitConstraints) &&
    sameValues(snapshot.indexes, expectedPaymentSplitIndexes);
}

export function hasNoHumanSupportSummaryObjects(snapshot) {
  return snapshot.columns.length === 0 && snapshot.indexes.length === 0;
}

export function hasExpectedHumanSupportSummarySchema(snapshot) {
  const columnsMatch = snapshot.columns.length === expectedHumanSupportSummaryColumns.length &&
    expectedHumanSupportSummaryColumns.every((expected, index) => {
      const actual = snapshot.columns[index];
      return actual &&
        actual.columnName === expected[0] &&
        actual.dataType === expected[1] &&
        actual.udtName === expected[2] &&
        actual.isNullable === expected[3] &&
        normalizeDefault(actual.columnDefault) === normalizeDefault(expected[4]);
    });
  return columnsMatch &&
    snapshot.indexes.length === 1 &&
    snapshot.indexes[0].name === HUMAN_SUPPORT_SUMMARY_INDEX &&
    snapshot.indexes[0].isUnique === false &&
    snapshot.indexes[0].columns.length === expectedHumanSupportSummaryIndexColumns.length &&
    snapshot.indexes[0].columns.every(
      (column, index) => column === expectedHumanSupportSummaryIndexColumns[index],
    );
}

function sameValues(actual, expected) {
  return actual.length === expected.length &&
    [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

async function readMessengerSnapshot(prisma) {
  const [enumValues, columns, primaryKey, foreignKeys, indexes, rls, policies, clientGrants] = await Promise.all([
    prisma.$queryRaw`SELECT e.enumlabel AS "value" FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'MessengerAuditStatus' ORDER BY e.enumsortorder`,
    prisma.$queryRaw`SELECT column_name AS "columnName", data_type AS "dataType", udt_name AS "udtName", is_nullable AS "isNullable", column_default AS "columnDefault" FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'MessengerAuditRun' ORDER BY ordinal_position`,
    prisma.$queryRaw`SELECT conname AS "name" FROM pg_constraint WHERE conrelid = 'public."MessengerAuditRun"'::regclass AND contype = 'p'`,
    prisma.$queryRaw`SELECT conname AS "name" FROM pg_constraint WHERE conrelid = 'public."MessengerAuditRun"'::regclass AND contype = 'f' ORDER BY conname`,
    prisma.$queryRaw`SELECT indexname AS "name" FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'MessengerAuditRun' AND indexname <> 'MessengerAuditRun_pkey' ORDER BY indexname`,
    prisma.$queryRaw`SELECT c.relrowsecurity AS "enabled", c.relforcerowsecurity AS "forced" FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'MessengerAuditRun' AND c.relkind = 'r'`,
    prisma.$queryRaw`SELECT count(*)::int AS "count" FROM pg_policies WHERE schemaname = 'public' AND tablename = 'MessengerAuditRun'`,
    prisma.$queryRaw`SELECT count(*)::int AS "count" FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'MessengerAuditRun' AND grantee IN ('anon', 'authenticated')`,
  ]);
  return {
    enumValues: enumValues.map((row) => row.value),
    columns,
    primaryKey: primaryKey.length === 1 ? primaryKey[0].name : null,
    foreignKeys: foreignKeys.map((row) => row.name),
    indexes: indexes.map((row) => row.name),
    rlsEnabled: rls.length === 1 ? rls[0].enabled : null,
    rlsForced: rls.length === 1 ? rls[0].forced : null,
    policyCount: policies.length === 1 ? policies[0].count : null,
    clientGrantCount: clientGrants.length === 1 ? clientGrants[0].count : null,
  };
}

async function readPaymentSplitSnapshot(prisma) {
  const [table, constraints, indexes, paymentMethodValues, columns] = await Promise.all([
    prisma.$queryRaw`SELECT to_regclass('public."TransactionPaymentSplit"') IS NOT NULL AS "exists"`,
    prisma.$queryRaw`SELECT conname AS "name" FROM pg_constraint WHERE conrelid = to_regclass('public."TransactionPaymentSplit"') ORDER BY conname`,
    prisma.$queryRaw`SELECT indexname AS "name" FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'TransactionPaymentSplit' AND indexname <> 'TransactionPaymentSplit_pkey' ORDER BY indexname`,
    prisma.$queryRaw`SELECT e.enumlabel AS "value" FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'PaymentMethod' ORDER BY e.enumsortorder`,
    prisma.$queryRaw`SELECT column_name AS "columnName", data_type AS "dataType", udt_name AS "udtName", is_nullable AS "isNullable", column_default AS "columnDefault" FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'TransactionPaymentSplit' ORDER BY ordinal_position`,
  ]);
  return {
    tableExists: table.length === 1 && table[0].exists === true,
    constraints: constraints.map((row) => row.name),
    indexes: indexes.map((row) => row.name),
    paymentMethodValues: paymentMethodValues.map((row) => row.value),
    columns,
  };
}

async function readHumanSupportSummarySnapshot(prisma) {
  const [columns, indexes] = await Promise.all([
    prisma.$queryRaw`SELECT column_name AS "columnName", data_type AS "dataType", udt_name AS "udtName", is_nullable AS "isNullable", column_default AS "columnDefault" FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'DigitalButlerLead' AND column_name IN ('customerDisplayName', 'customerAvatarUrl', 'customerReference', 'lastMessageCiphertext', 'lastMessageIv', 'lastMessageAuthTag', 'lastMessageAt') ORDER BY ordinal_position`,
    prisma.$queryRaw`SELECT i.relname AS "name", ix.indisunique AS "isUnique", array_agg(a.attname ORDER BY keys.ordinality) AS "columns" FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace JOIN pg_index ix ON t.oid = ix.indrelid JOIN pg_class i ON i.oid = ix.indexrelid JOIN unnest(ix.indkey) WITH ORDINALITY AS keys(attnum, ordinality) ON true JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = keys.attnum WHERE n.nspname = 'public' AND t.relname = 'DigitalButlerLead' AND i.relname = ${HUMAN_SUPPORT_SUMMARY_INDEX} GROUP BY i.relname, ix.indisunique`,
  ]);
  return { columns, indexes };
}

async function readMessengerLedger(prisma) {
  const [rows, failedRows] = await Promise.all([
    prisma.$queryRaw`SELECT migration_name AS "migrationName", checksum, finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt", applied_steps_count::int AS "appliedStepsCount", logs FROM "_prisma_migrations" WHERE migration_name = ${MESSENGER_MIGRATION}`,
    prisma.$queryRaw`SELECT migration_name AS "migrationName" FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL ORDER BY migration_name`,
  ]);
  return { rows, failedMigrationNames: failedRows.map((row) => row.migrationName) };
}

async function readPaymentSplitLedger(prisma) {
  const rows = await prisma.$queryRaw`SELECT checksum, finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt" FROM "_prisma_migrations" WHERE migration_name = ${PAYMENT_SPLIT_MIGRATION}`;
  return rows.length === 1 ? rows[0] : null;
}

export function isAppliedPaymentSplitMigration(row) {
  return row?.checksum === PAYMENT_SPLIT_CHECKSUM &&
    row.finishedAt !== null &&
    row.rolledBackAt === null;
}

export function isAppliedHumanSupportSummaryMigration(row) {
  return row?.checksum === HUMAN_SUPPORT_SUMMARY_CHECKSUM &&
    row.finishedAt !== null &&
    row.rolledBackAt === null;
}

async function readHumanSupportSummaryLedger(prisma) {
  const rows = await prisma.$queryRaw`SELECT checksum, finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt" FROM "_prisma_migrations" WHERE migration_name = ${HUMAN_SUPPORT_SUMMARY_MIGRATION}`;
  return rows.length === 1 ? rows[0] : null;
}

async function runHumanSupportSummaryMigration(prisma) {
  const initialStatus = runPrisma(["migrate", "status"]);
  if (isStatusUpToDate(initialStatus)) {
    const [current, ledger] = await Promise.all([
      readHumanSupportSummarySnapshot(prisma),
      readHumanSupportSummaryLedger(prisma),
    ]);
    if (
      !hasExpectedHumanSupportSummarySchema(current) ||
      !isAppliedHumanSupportSummaryMigration(ledger)
    ) {
      abort("human_support_applied_state_rejected");
    }
    log("human_support_already_applied_verified");
    return;
  }
  if (initialStatus.exitCode !== 1 || !hasOnlyHumanSupportSummaryPending(initialStatus.output)) {
    abort("human_support_pending_allowlist_rejected");
  }
  const before = await readHumanSupportSummarySnapshot(prisma);
  if (!hasNoHumanSupportSummaryObjects(before)) {
    abort("human_support_preflight_rejected");
  }
  log("human_support_preflight_verified");
  log("human_support_deploy_started");
  if (runPrisma(["migrate", "deploy"]).exitCode !== 0) {
    abort("human_support_deploy_failed");
  }
  log("human_support_deploy_succeeded");
  const finalStatus = runPrisma(["migrate", "status"]);
  if (!isStatusUpToDate(finalStatus)) abort("human_support_final_status_rejected");
  const [after, ledger] = await Promise.all([
    readHumanSupportSummarySnapshot(prisma),
    readHumanSupportSummaryLedger(prisma),
  ]);
  if (
    !hasExpectedHumanSupportSummarySchema(after) ||
    !isAppliedHumanSupportSummaryMigration(ledger)
  ) {
    abort("human_support_final_schema_rejected");
  }
  log("human_support_final_schema_verified");
}

function isStatusUpToDate(result) {
  return result.exitCode === 0 && result.output.includes("Database schema is up to date");
}

async function main() {
  if (process.env.VERCEL_ENV !== EXPECTED_ENVIRONMENT) {
    log("recovery_skipped_outside_production");
    return;
  }

  const target = process.env[PRODUCTION_MIGRATION_TARGET_ENV];
  if (!target) {
    log("migration_skipped_no_target");
    return;
  }

  assertApprovedMigrationTarget(target);

  log("recovery_preflight_started");
  assertProductionConnection();
  if (
    migrationChecksum(MESSENGER_MIGRATION_FILE) !== MESSENGER_CHECKSUM ||
    migrationChecksum(PAYMENT_SPLIT_MIGRATION_FILE) !== PAYMENT_SPLIT_CHECKSUM
  ) {
    abort("migration_checksum_mismatch");
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL } },
  });
  try {
    if (target === HUMAN_SUPPORT_SUMMARY_MIGRATION) {
      await runHumanSupportSummaryMigration(prisma);
      return;
    }
    const ledger = await readMessengerLedger(prisma);
    const messengerState = classifyMessengerMigration(
      ledger.rows,
      ledger.failedMigrationNames,
    );
    if (messengerState === "invalid") abort("messenger_state_rejected");

    const messengerSnapshot = await readMessengerSnapshot(prisma);
    if (!hasExpectedMessengerRls(messengerSnapshot)) abort("messenger_rls_rejected");

    const initialStatus = runPrisma(["migrate", "status"]);
    if (messengerState === "applied" && isStatusUpToDate(initialStatus)) {
      const [paymentSnapshot, paymentLedger] = await Promise.all([
        readPaymentSplitSnapshot(prisma),
        readPaymentSplitLedger(prisma),
      ]);
      if (
        !hasExpectedPaymentSplitSchema(paymentSnapshot) ||
        !isAppliedPaymentSplitMigration(paymentLedger)
      ) {
        abort("final_schema_verification_failed");
      }
      log("recovery_final_status_verified");
      return;
    }

    if (messengerState === "failed") {
      if (!hasExpectedMessengerSchema(messengerSnapshot)) {
        abort("messenger_schema_fingerprint_mismatch");
      }
      log("messenger_state_failed_verified");
      log("manual_reconciliation_required");
      return;
    } else {
      log("messenger_state_applied");
      await prisma.$disconnect();
    }

    const afterMessenger = messengerState === "applied" ? initialStatus : runPrisma(["migrate", "status"]);
    if (afterMessenger.exitCode !== 1 || !hasOnlyPaymentSplitPending(afterMessenger.output)) {
      abort("pending_migration_allowlist_rejected");
    }

    const paymentPrisma = new PrismaClient({
      datasources: { db: { url: process.env.DIRECT_URL } },
    });
    try {
      const paymentSnapshot = await readPaymentSplitSnapshot(paymentPrisma);
      if (!hasNoPaymentSplitObjects(paymentSnapshot)) {
        abort("payment_split_preflight_rejected");
      }
    } finally {
      await paymentPrisma.$disconnect();
    }
    log("payment_split_preflight_verified");
    log("payment_split_deploy_started");
    if (runPrisma(["migrate", "deploy"]).exitCode !== 0) {
      abort("payment_split_deploy_failed");
    }
    log("payment_split_deploy_succeeded");

    const finalStatus = runPrisma(["migrate", "status"]);
    if (!isStatusUpToDate(finalStatus)) abort("final_status_not_up_to_date");

    const finalPrisma = new PrismaClient({
      datasources: { db: { url: process.env.DIRECT_URL } },
    });
    try {
      const [finalLedger, finalPaymentLedger, finalPayment, finalMessenger] = await Promise.all([
        readMessengerLedger(finalPrisma),
        readPaymentSplitLedger(finalPrisma),
        readPaymentSplitSnapshot(finalPrisma),
        readMessengerSnapshot(finalPrisma),
      ]);
      if (
        classifyMessengerMigration(finalLedger.rows, finalLedger.failedMigrationNames) !== "applied" ||
        !isAppliedPaymentSplitMigration(finalPaymentLedger) ||
        !hasExpectedPaymentSplitSchema(finalPayment) ||
        !hasExpectedMessengerRls(finalMessenger)
      ) {
        abort("final_schema_verification_failed");
      }
    } finally {
      await finalPrisma.$disconnect();
    }
    log("recovery_final_status_verified");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => abort("unexpected_recovery_error"));
}
