import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

// Course acceptance preflight: read-only and restricted to this Preview branch.
// Never print connection strings, credentials, or raw database errors.
if (
  process.env.VERCEL_ENV === "preview" &&
  process.env.VERCEL_GIT_COMMIT_REF === "codex/course-scheduling-stage1"
) {
  const testRef = "ttworfzgwejdeolegkxl";
  const matches = (value) => {
    try {
      const u = new URL(value ?? "");
      return ["postgres:", "postgresql:"].includes(u.protocol) && (
        u.hostname === `db.${testRef}.supabase.co` ||
        (/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname) &&
         u.username === `postgres.${testRef}`)
      );
    } catch { return false; }
  };
  const target = {
    databaseIsTest: matches(process.env.DATABASE_URL),
    directIsTest: matches(process.env.DIRECT_URL),
  };
  console.info("[course-preview-preflight] target", target);
  if (!target.databaseIsTest || !target.directIsTest)
    throw new Error("Course Preview requires the isolated test database for both connections.");
  const checkedUrl = new URL(process.env.DATABASE_URL);
  checkedUrl.searchParams.set("connection_limit", "1");
  checkedUrl.searchParams.set("connect_timeout", "10");
  checkedUrl.searchParams.set("pool_timeout", "10");
  if (checkedUrl.hostname.endsWith(".pooler.supabase.com"))
    checkedUrl.searchParams.set("pgbouncer", "true");
  const checkClient = new PrismaClient({
    datasources: { db: { url: checkedUrl.toString() } },
    log: [],
  });
  try {
    await checkClient.$queryRawUnsafe('SELECT 1 FROM "CourseSession" LIMIT 1');
    await checkClient.$queryRawUnsafe('SELECT "remaining", "expiresAt", "closedAt" FROM "CoursePointCard" LIMIT 1');
    await checkClient.$queryRawUnsafe('SELECT "operatorCustomerId", "status", "checkedInAt", notes FROM "CourseBooking" LIMIT 1');
    await checkClient.$queryRawUnsafe('SELECT "capacity", "details" FROM "CourseRoom" LIMIT 1');
    await checkClient.$queryRawUnsafe('SELECT "courseMemberEnabled" FROM "StaffMemberLink" LIMIT 1');
    await checkClient.$queryRawUnsafe('SELECT phone, "emergencyContactName", "emergencyContactPhone" FROM "Staff" LIMIT 1');
    await checkClient.$queryRawUnsafe('SELECT "unit", "templateIds" FROM "CoursePointCard" LIMIT 1');
    await checkClient.$queryRawUnsafe('SELECT id, note, "revenueStaffId", "voidedAt" FROM "CoursePurchase" LIMIT 1');
    await checkClient.$queryRawUnsafe('SELECT id, amount, method FROM "CoursePurchaseRefund" LIMIT 1');
    await checkClient.$queryRawUnsafe('SELECT "emergencyContactName", "emergencyContactPhone" FROM "Customer" LIMIT 1');
    await checkClient.$queryRawUnsafe('SELECT "courseBookingId", "courseCardId" FROM "MessageLog" LIMIT 1');
    await checkClient.$queryRawUnsafe('SELECT "lowBalanceEnabled", "lowBalanceThreshold" FROM "CoursePointPlan" LIMIT 1');
    await checkClient.$queryRawUnsafe('SELECT id, "stoppedAt" FROM "CourseBalanceReminderPreference" LIMIT 1');
    await checkClient.$queryRawUnsafe('SELECT "bookingKind", "trialPrice" FROM "CourseBooking" LIMIT 1');
    await checkClient.$queryRawUnsafe('SELECT id, "paymentSplits", "voidedAt" FROM "CourseTrialPayment" LIMIT 1');
    console.info("[course-preview-preflight] course_schema_readable=true; points_schema=20260917094700; trial_schema=20260917143018");
  } catch {
    throw new Error("Course Preview test database connection or course schema check failed.");
  } finally { await checkClient.$disconnect(); }
}


const EXPECTED_ENVIRONMENT = "production";
const EXPECTED_PROJECT_REF = "qijlnhtpbintanzpxkvf";
export const MESSENGER_MIGRATION =
  "20260729090000_add_messenger_audit_runs";
export const PAYMENT_SPLIT_MIGRATION =
  "20260801090000_add_transaction_payment_splits";
export const HUMAN_SUPPORT_SUMMARY_MIGRATION =
  "20260802090000_add_digital_butler_human_support_summary";
export const PAYMENT_SPLIT_RLS_MIGRATION =
  "20260808090000_enable_transaction_payment_split_rls";
export const TRANSACTION_CONVERSION_SNAPSHOT_MIGRATION =
  "20260814183000_add_transaction_conversion_snapshot";
export const RECURRING_CONFIRMATION_MIGRATION =
  "20260826143000_add_recurring_confirmation_notification";
export const STAFF_MEMBER_LINK_MIGRATION =
  "20260913090000_add_staff_member_link";
export const SPA_MEMBER_STAFF_RELEASE_TARGET =
  "spa_member_staff_release_20260914";
export const PRODUCTION_MIGRATION_TARGET_ENV = "PRODUCTION_MIGRATION_TARGET";
export const APPROVED_PRODUCTION_MIGRATION_TARGETS = [
  PAYMENT_SPLIT_MIGRATION,
  HUMAN_SUPPORT_SUMMARY_MIGRATION,
  PAYMENT_SPLIT_RLS_MIGRATION,
  TRANSACTION_CONVERSION_SNAPSHOT_MIGRATION,
  SPA_MEMBER_STAFF_RELEASE_TARGET,
];
export const MESSENGER_CHECKSUM =
  "6edbd88d9fd2ab9e368b963d21f7d90ef2ed1f8e8c467a29c20f9a3c8d8e1488";
export const PAYMENT_SPLIT_CHECKSUM =
  "74750d2d3f24dba84a4f58380a8ed9868734500ddd50e8d632d223cefeb07287";
export const HUMAN_SUPPORT_SUMMARY_CHECKSUM =
  "9218b485f642748141666778d7643bc5ba1aee27541ae8dc17461dacd3884ad5";
export const PAYMENT_SPLIT_RLS_CHECKSUM =
  "bdc2cd86ea67507df334271b3589c7e416bad4ec2c1cddc96da23b7f3d0f2064";
export const TRANSACTION_CONVERSION_SNAPSHOT_CHECKSUM =
  "71f451fb1a4830543ab32c6d7f6ed2ef88be7b0fd6a9bbd5ffe69e0e50148e13";
export const RECURRING_CONFIRMATION_CHECKSUM =
  "c1acba47d93b5f2b0e0e5f8fb1dbc54837640d8c2b2f64b2da0a2366ee74fa2c";
export const STAFF_MEMBER_LINK_CHECKSUM =
  "97bc01e987723d307f895f54282636c441919a70584a660f6ab9f45c6b3be180";
const PENDING_MIGRATIONS_HEADER =
  /Following migrations? have not yet been applied:/;
const MESSENGER_MIGRATION_FILE =
  `prisma/migrations/${MESSENGER_MIGRATION}/migration.sql`;
const PAYMENT_SPLIT_MIGRATION_FILE =
  `prisma/migrations/${PAYMENT_SPLIT_MIGRATION}/migration.sql`;
const HUMAN_SUPPORT_SUMMARY_MIGRATION_FILE =
  `prisma/migrations/${HUMAN_SUPPORT_SUMMARY_MIGRATION}/migration.sql`;
const PAYMENT_SPLIT_RLS_MIGRATION_FILE =
  `prisma/migrations/${PAYMENT_SPLIT_RLS_MIGRATION}/migration.sql`;
const TRANSACTION_CONVERSION_SNAPSHOT_MIGRATION_FILE =
  `prisma/migrations/${TRANSACTION_CONVERSION_SNAPSHOT_MIGRATION}/migration.sql`;
const RECURRING_CONFIRMATION_MIGRATION_FILE =
  `prisma/migrations/${RECURRING_CONFIRMATION_MIGRATION}/migration.sql`;
const STAFF_MEMBER_LINK_MIGRATION_FILE =
  `prisma/migrations/${STAFF_MEMBER_LINK_MIGRATION}/migration.sql`;
const SPA_PRODUCTION_READINESS_SCRIPT =
  "scripts/spa-production-migration-readiness.mjs";
const SPA_HISTORY_RECONCILIATION_CONFIRMATION =
  "RECONCILE_SUPERSEDED_SPA_HISTORY";
const SPA_MEMBER_STAFF_RELEASE_LOCK = 2026091309n;
const recurringConfirmationColumns = [
  "confirmationNotificationClaimedAt",
  "confirmationNotificationError",
  "confirmationNotificationSentAt",
  "confirmationNotificationStatus",
];
const expectedStaffMemberLinkColumns = [
  ["createdAt", "timestamp without time zone", "timestamp", "NO", "CURRENT_TIMESTAMP"],
  ["id", "text", "text", "NO", null],
  ["linkedAt", "timestamp without time zone", "timestamp", "NO", "CURRENT_TIMESTAMP"],
  ["linkedByUserId", "text", "text", "YES", null],
  ["revokedAt", "timestamp without time zone", "timestamp", "YES", null],
  ["staffId", "text", "text", "NO", null],
  ["storeId", "text", "text", "NO", null],
  ["updatedAt", "timestamp without time zone", "timestamp", "NO", null],
  ["userId", "text", "text", "NO", null],
];
const expectedStaffMemberLinkConstraints = [
  "StaffMemberLink_linkedByUserId_fkey",
  "StaffMemberLink_pkey",
  "StaffMemberLink_staffId_storeId_fkey",
  "StaffMemberLink_storeId_fkey",
  "StaffMemberLink_userId_fkey",
];
const expectedStaffMemberLinkIndexes = [
  "StaffMemberLink_storeId_revokedAt_idx",
  "StaffMemberLink_userId_idx",
  "uq_staff_member_link_staff_store",
  "uq_staff_member_link_user_store",
];
const transactionConversionSnapshotColumns = [
  "conversionEffectsApplied", "conversionSnapshotCaptured",
  "firstTopupRewardsApplied", "firstTopupReferrerRewardApplied",
  "firstTopupSelfRewardApplied", "preConversionCustomerStage",
  "preConversionSelfBookingEnabled", "preConversionConvertedAt",
  "conversionAppliedConvertedAt",
];

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
  const targetFiles = {
    [PAYMENT_SPLIT_MIGRATION]: [PAYMENT_SPLIT_MIGRATION_FILE, PAYMENT_SPLIT_CHECKSUM],
    [HUMAN_SUPPORT_SUMMARY_MIGRATION]: [HUMAN_SUPPORT_SUMMARY_MIGRATION_FILE, HUMAN_SUPPORT_SUMMARY_CHECKSUM],
    [PAYMENT_SPLIT_RLS_MIGRATION]: [PAYMENT_SPLIT_RLS_MIGRATION_FILE, PAYMENT_SPLIT_RLS_CHECKSUM],
    [TRANSACTION_CONVERSION_SNAPSHOT_MIGRATION]: [TRANSACTION_CONVERSION_SNAPSHOT_MIGRATION_FILE, TRANSACTION_CONVERSION_SNAPSHOT_CHECKSUM],
    [SPA_MEMBER_STAFF_RELEASE_TARGET]: null,
  };
  const target = targetFiles[value];
  if (target && migrationChecksum(target[0]) !== target[1]) {
    abort("migration_target_checksum_mismatch");
  }
  if (value === SPA_MEMBER_STAFF_RELEASE_TARGET && (
    migrationChecksum(RECURRING_CONFIRMATION_MIGRATION_FILE) !== RECURRING_CONFIRMATION_CHECKSUM ||
    migrationChecksum(STAFF_MEMBER_LINK_MIGRATION_FILE) !== STAFF_MEMBER_LINK_CHECKSUM
  )) abort("migration_target_checksum_mismatch");
}

function runPrisma(args) {
  try {
    return {
      exitCode: 0,
      output: execFileSync("npx", ["prisma", ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          PGOPTIONS: "-c lock_timeout=5s -c statement_timeout=120s",
        },
      }),
    };
  } catch (error) {
    return {
      exitCode: error.status ?? 1,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

function runSpaProductionReadiness(args, failureCode) {
  try {
    execFileSync(process.execPath, [SPA_PRODUCTION_READINESS_SCRIPT, ...args], {
      stdio: "inherit",
      env: {
        ...process.env,
        PGOPTIONS: "-c lock_timeout=5s -c statement_timeout=120s",
      },
    });
  } catch {
    abort(failureCode);
  }
}

function prepareSpaProductionHistory() {
  log("spa_history_inspection_started");
  runSpaProductionReadiness(
    ["--inspect"],
    "spa_history_inspection_failed",
  );
  log("spa_history_inspection_verified");

  log("spa_history_reconciliation_started");
  runSpaProductionReadiness(
    [
      "--reconcile-superseded",
      `--confirm=${SPA_HISTORY_RECONCILIATION_CONFIRMATION}`,
    ],
    "spa_history_reconciliation_failed",
  );
  log("spa_history_reconciliation_verified");
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

export function hasOnlyPaymentSplitRlsPending(statusOutput) {
  const pending = pendingMigrations(statusOutput);
  return pending.length === 1 && pending[0] === PAYMENT_SPLIT_RLS_MIGRATION;
}

export function hasOnlyTransactionConversionSnapshotPending(statusOutput) {
  const pending = pendingMigrations(statusOutput);
  return pending.length === 1 && pending[0] === TRANSACTION_CONVERSION_SNAPSHOT_MIGRATION;
}

export function hasAllowedSpaMemberStaffReleasePending(statusOutput) {
  const pending = pendingMigrations(statusOutput);
  return (
    pending.length === 2 &&
    pending[0] === RECURRING_CONFIRMATION_MIGRATION &&
    pending[1] === STAFF_MEMBER_LINK_MIGRATION
  ) || (
    pending.length === 1 && pending[0] === STAFF_MEMBER_LINK_MIGRATION
  );
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
  const [table, constraints, indexes, paymentMethodValues, columns, rls, policies, clientGrants] = await Promise.all([
    prisma.$queryRaw`SELECT to_regclass('public."TransactionPaymentSplit"') IS NOT NULL AS "exists"`,
    prisma.$queryRaw`SELECT conname AS "name" FROM pg_constraint WHERE conrelid = to_regclass('public."TransactionPaymentSplit"') ORDER BY conname`,
    prisma.$queryRaw`SELECT indexname AS "name" FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'TransactionPaymentSplit' AND indexname <> 'TransactionPaymentSplit_pkey' ORDER BY indexname`,
    prisma.$queryRaw`SELECT e.enumlabel AS "value" FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'PaymentMethod' ORDER BY e.enumsortorder`,
    prisma.$queryRaw`SELECT column_name AS "columnName", data_type AS "dataType", udt_name AS "udtName", is_nullable AS "isNullable", column_default AS "columnDefault" FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'TransactionPaymentSplit' ORDER BY ordinal_position`,
    prisma.$queryRaw`SELECT c.relrowsecurity AS "enabled", c.relforcerowsecurity AS "forced" FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'TransactionPaymentSplit' AND c.relkind = 'r'`,
    prisma.$queryRaw`SELECT count(*)::int AS "count" FROM pg_policies WHERE schemaname = 'public' AND tablename = 'TransactionPaymentSplit'`,
    prisma.$queryRaw`SELECT count(*)::int AS "count" FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'TransactionPaymentSplit' AND grantee IN ('anon', 'authenticated')`,
  ]);
  return {
    tableExists: table.length === 1 && table[0].exists === true,
    constraints: constraints.map((row) => row.name),
    indexes: indexes.map((row) => row.name),
    paymentMethodValues: paymentMethodValues.map((row) => row.value),
    columns,
    rlsEnabled: rls.length === 1 ? rls[0].enabled : null,
    rlsForced: rls.length === 1 ? rls[0].forced : null,
    policyCount: policies.length === 1 ? policies[0].count : null,
    clientGrantCount: clientGrants.length === 1 ? clientGrants[0].count : null,
  };
}

export function hasExpectedPaymentSplitRls(snapshot, enabled) {
  return snapshot.rlsEnabled === enabled &&
    snapshot.rlsForced === false &&
    snapshot.policyCount === 0 &&
    snapshot.clientGrantCount === 0;
}

async function readHumanSupportSummarySnapshot(prisma) {
  const [columns, indexes] = await Promise.all([
    prisma.$queryRaw`SELECT column_name AS "columnName", data_type AS "dataType", udt_name AS "udtName", is_nullable AS "isNullable", column_default AS "columnDefault" FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'DigitalButlerLead' AND column_name IN ('customerDisplayName', 'customerAvatarUrl', 'customerReference', 'lastMessageCiphertext', 'lastMessageIv', 'lastMessageAuthTag', 'lastMessageAt') ORDER BY ordinal_position`,
    prisma.$queryRaw`SELECT i.relname AS "name", ix.indisunique AS "isUnique", array_agg(a.attname ORDER BY keys.ordinality) AS "columns" FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace JOIN pg_index ix ON t.oid = ix.indrelid JOIN pg_class i ON i.oid = ix.indexrelid JOIN unnest(ix.indkey) WITH ORDINALITY AS keys(attnum, ordinality) ON true JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = keys.attnum WHERE n.nspname = 'public' AND t.relname = 'DigitalButlerLead' AND i.relname = ${HUMAN_SUPPORT_SUMMARY_INDEX} GROUP BY i.relname, ix.indisunique`,
  ]);
  return { columns, indexes };
}

async function readTransactionConversionSnapshot(prisma) {
  return prisma.$queryRaw`SELECT column_name AS "columnName", data_type AS "dataType", udt_name AS "udtName", is_nullable AS "isNullable", column_default AS "columnDefault", datetime_precision AS "datetimePrecision" FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Transaction' AND column_name IN ('conversionEffectsApplied', 'conversionSnapshotCaptured', 'firstTopupRewardsApplied', 'firstTopupReferrerRewardApplied', 'firstTopupSelfRewardApplied', 'preConversionCustomerStage', 'preConversionSelfBookingEnabled', 'preConversionConvertedAt', 'conversionAppliedConvertedAt') ORDER BY column_name`;
}

export function hasNoTransactionConversionSnapshotColumns(columns) {
  return columns.length === 0;
}

export function hasExpectedTransactionConversionSnapshotColumns(columns) {
  if (columns.length !== transactionConversionSnapshotColumns.length) return false;
  const byName = new Map(columns.map((column) => [column.columnName, column]));
  return transactionConversionSnapshotColumns.every((name) => byName.has(name)) &&
    ["conversionEffectsApplied", "conversionSnapshotCaptured", "firstTopupRewardsApplied", "firstTopupReferrerRewardApplied", "firstTopupSelfRewardApplied"].every((name) => {
      const column = byName.get(name);
      return column.dataType === "boolean" && column.udtName === "bool" &&
        column.isNullable === "NO" && column.columnDefault === "false";
    }) &&
    byName.get("preConversionCustomerStage")?.udtName === "CustomerStage" &&
    byName.get("preConversionCustomerStage")?.isNullable === "YES" &&
    byName.get("preConversionCustomerStage")?.columnDefault === null &&
    byName.get("preConversionSelfBookingEnabled")?.dataType === "boolean" &&
    byName.get("preConversionSelfBookingEnabled")?.isNullable === "YES" &&
    byName.get("preConversionSelfBookingEnabled")?.columnDefault === null &&
    ["preConversionConvertedAt", "conversionAppliedConvertedAt"].every((name) =>
      byName.get(name)?.dataType === "timestamp without time zone" &&
      byName.get(name)?.isNullable === "YES" && byName.get(name)?.columnDefault === null &&
      byName.get(name)?.datetimePrecision === 3
    );
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

async function readPaymentSplitRlsLedger(prisma) {
  const rows = await prisma.$queryRaw`SELECT checksum, finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt" FROM "_prisma_migrations" WHERE migration_name = ${PAYMENT_SPLIT_RLS_MIGRATION}`;
  return rows.length === 1 ? rows[0] : null;
}

async function readTransactionConversionSnapshotLedger(prisma) {
  const rows = await prisma.$queryRaw`SELECT checksum, finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt" FROM "_prisma_migrations" WHERE migration_name = ${TRANSACTION_CONVERSION_SNAPSHOT_MIGRATION}`;
  return rows.length === 1 ? rows[0] : null;
}

async function readNamedMigrationLedger(prisma, migrationName) {
  const rows = await prisma.$queryRaw`SELECT checksum, finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt" FROM "_prisma_migrations" WHERE migration_name = ${migrationName}`;
  return rows.length === 1 ? rows[0] : null;
}

async function readRecurringConfirmationSnapshot(prisma) {
  return prisma.$queryRaw`SELECT column_name AS "columnName", data_type AS "dataType", udt_name AS "udtName", is_nullable AS "isNullable", column_default AS "columnDefault", datetime_precision AS "datetimePrecision" FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'BookingRecurrenceGroup' AND column_name IN ('confirmationNotificationStatus', 'confirmationNotificationClaimedAt', 'confirmationNotificationSentAt', 'confirmationNotificationError') ORDER BY column_name`;
}

export function hasNoRecurringConfirmationColumns(columns) {
  return columns.length === 0;
}

export function hasExpectedRecurringConfirmationColumns(columns) {
  if (columns.length !== recurringConfirmationColumns.length) return false;
  const byName = new Map(columns.map((column) => [column.columnName, column]));
  return recurringConfirmationColumns.every((name) => byName.has(name)) &&
    ["confirmationNotificationClaimedAt", "confirmationNotificationSentAt"].every((name) => {
      const column = byName.get(name);
      return column.dataType === "timestamp without time zone" &&
        column.udtName === "timestamp" && column.isNullable === "YES" &&
        column.columnDefault === null && column.datetimePrecision === 3;
    }) &&
    byName.get("confirmationNotificationError")?.dataType === "text" &&
    byName.get("confirmationNotificationError")?.isNullable === "YES" &&
    byName.get("confirmationNotificationError")?.columnDefault === null &&
    byName.get("confirmationNotificationStatus")?.dataType === "text" &&
    byName.get("confirmationNotificationStatus")?.isNullable === "NO" &&
    normalizeDefault(byName.get("confirmationNotificationStatus")?.columnDefault) === "'PENDING'::text";
}

async function readStaffMemberLinkSnapshot(prisma) {
  const table = await prisma.$queryRaw`SELECT to_regclass('public."StaffMemberLink"') IS NOT NULL AS "exists"`;
  const tableExists = table[0]?.exists === true;
  const [columns, constraints, indexes, rls, policies, clientGrants, rows, prerequisiteColumns, staffUniqueIndex, invalidStaffRows] = await Promise.all([
    prisma.$queryRaw`SELECT column_name AS "columnName", data_type AS "dataType", udt_name AS "udtName", is_nullable AS "isNullable", column_default AS "columnDefault" FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'StaffMemberLink' ORDER BY column_name`,
    prisma.$queryRaw`SELECT conname AS "name" FROM pg_constraint WHERE conrelid = to_regclass('public."StaffMemberLink"') ORDER BY conname`,
    prisma.$queryRaw`SELECT indexname AS "name" FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'StaffMemberLink' AND indexname <> 'StaffMemberLink_pkey' ORDER BY indexname`,
    prisma.$queryRaw`SELECT c.relrowsecurity AS "enabled", c.relforcerowsecurity AS "forced" FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'StaffMemberLink' AND c.relkind = 'r'`,
    prisma.$queryRaw`SELECT count(*)::int AS "count" FROM pg_policies WHERE schemaname = 'public' AND tablename = 'StaffMemberLink'`,
    prisma.$queryRaw`SELECT count(*)::int AS "count" FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'StaffMemberLink' AND grantee IN ('anon', 'authenticated')`,
    tableExists ? prisma.$queryRaw`SELECT count(*)::int AS "count" FROM "StaffMemberLink"` : Promise.resolve([{ count: 0 }]),
    prisma.$queryRaw`SELECT table_name AS "tableName", column_name AS "columnName", data_type AS "dataType", is_nullable AS "isNullable" FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'User' AND column_name = 'id') OR (table_name = 'Store' AND column_name = 'id') OR (table_name = 'Staff' AND column_name IN ('id', 'storeId'))) ORDER BY table_name, column_name`,
    prisma.$queryRaw`SELECT count(*)::int AS "count" FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'Staff' AND indexname = 'Staff_id_storeId_key' AND indexdef LIKE 'CREATE UNIQUE INDEX%'`,
    prisma.$queryRaw`SELECT (count(*) FILTER (WHERE "storeId" IS NULL) + count(*) - count(DISTINCT (id, "storeId")))::int AS "count" FROM "Staff"`,
  ]);
  return {
    tableExists,
    columns,
    constraints: constraints.map((row) => row.name),
    indexes: indexes.map((row) => row.name),
    rlsEnabled: rls[0]?.enabled ?? null,
    rlsForced: rls[0]?.forced ?? null,
    policyCount: policies[0]?.count ?? null,
    clientGrantCount: clientGrants[0]?.count ?? null,
    rowCount: rows[0]?.count ?? null,
    prerequisiteValid:
      prerequisiteColumns.length === 4 &&
      prerequisiteColumns.every((column) => column.dataType === "text" && column.isNullable === "NO") &&
      staffUniqueIndex[0]?.count === 1 && invalidStaffRows[0]?.count === 0,
  };
}

export function hasNoStaffMemberLinkObjects(snapshot) {
  return snapshot.tableExists === false && snapshot.columns.length === 0 &&
    snapshot.constraints.length === 0 && snapshot.indexes.length === 0 &&
    snapshot.rowCount === 0 && snapshot.prerequisiteValid === true;
}

export function hasExpectedStaffMemberLinkSchema(snapshot) {
  const columnsMatch = snapshot.columns.length === expectedStaffMemberLinkColumns.length &&
    expectedStaffMemberLinkColumns.every((expected, index) => {
      const actual = snapshot.columns[index];
      return actual?.columnName === expected[0] && actual.dataType === expected[1] &&
        actual.udtName === expected[2] && actual.isNullable === expected[3] &&
        normalizeDefault(actual.columnDefault) === normalizeDefault(expected[4]);
    });
  return snapshot.tableExists === true && columnsMatch &&
    sameValues(snapshot.constraints, expectedStaffMemberLinkConstraints) &&
    sameValues(snapshot.indexes, expectedStaffMemberLinkIndexes) &&
    snapshot.rlsEnabled === true && snapshot.rlsForced === false &&
    snapshot.policyCount === 0 && snapshot.clientGrantCount === 0 &&
    snapshot.prerequisiteValid === true;
}

function isAppliedNamedMigration(row, checksum) {
  return row?.checksum === checksum && row.finishedAt !== null && row.rolledBackAt === null;
}

async function withProductionMigrationLock(prisma, action) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${SPA_MEMBER_STAFF_RELEASE_LOCK}) AS "locked"`;
    if (rows[0]?.locked !== true) abort("production_migration_lock_unavailable");
    return action();
  }, { maxWait: 5_000, timeout: 180_000 });
}

async function runSpaMemberStaffRelease(prisma) {
  const initialStatus = runPrisma(["migrate", "status"]);
  const [recurringBefore, staffBefore, recurringLedgerBefore, staffLedgerBefore] = await Promise.all([
    readRecurringConfirmationSnapshot(prisma),
    readStaffMemberLinkSnapshot(prisma),
    readNamedMigrationLedger(prisma, RECURRING_CONFIRMATION_MIGRATION),
    readNamedMigrationLedger(prisma, STAFF_MEMBER_LINK_MIGRATION),
  ]);

  if (isStatusUpToDate(initialStatus)) {
    if (!hasExpectedRecurringConfirmationColumns(recurringBefore) ||
        !hasExpectedStaffMemberLinkSchema(staffBefore) ||
        !isAppliedNamedMigration(recurringLedgerBefore, RECURRING_CONFIRMATION_CHECKSUM) ||
        !isAppliedNamedMigration(staffLedgerBefore, STAFF_MEMBER_LINK_CHECKSUM)) {
      abort("spa_member_staff_applied_state_rejected");
    }
    log("spa_member_staff_already_applied_verified");
    return;
  }

  if (initialStatus.exitCode !== 1 || !hasAllowedSpaMemberStaffReleasePending(initialStatus.output)) {
    abort("spa_member_staff_pending_allowlist_rejected");
  }

  const recurringAlreadyApplied = isAppliedNamedMigration(
    recurringLedgerBefore,
    RECURRING_CONFIRMATION_CHECKSUM,
  );
  const recurringStateValid = recurringAlreadyApplied
    ? hasExpectedRecurringConfirmationColumns(recurringBefore)
    : hasNoRecurringConfirmationColumns(recurringBefore) && recurringLedgerBefore === null;
  if (!recurringStateValid || !hasNoStaffMemberLinkObjects(staffBefore) || staffLedgerBefore !== null) {
    abort("spa_member_staff_preflight_rejected");
  }

  log("spa_member_staff_preflight_verified");
  log("spa_member_staff_deploy_started");
  await withProductionMigrationLock(prisma, () => {
    if (runPrisma(["migrate", "deploy"]).exitCode !== 0) {
      abort("spa_member_staff_deploy_failed");
    }
  });
  log("spa_member_staff_deploy_succeeded");

  const finalStatus = runPrisma(["migrate", "status"]);
  if (!isStatusUpToDate(finalStatus)) abort("spa_member_staff_final_status_rejected");
  const [recurringAfter, staffAfter, recurringLedgerAfter, staffLedgerAfter] = await Promise.all([
    readRecurringConfirmationSnapshot(prisma),
    readStaffMemberLinkSnapshot(prisma),
    readNamedMigrationLedger(prisma, RECURRING_CONFIRMATION_MIGRATION),
    readNamedMigrationLedger(prisma, STAFF_MEMBER_LINK_MIGRATION),
  ]);
  if (!hasExpectedRecurringConfirmationColumns(recurringAfter) ||
      !hasExpectedStaffMemberLinkSchema(staffAfter) || staffAfter.rowCount !== 0 ||
      !isAppliedNamedMigration(recurringLedgerAfter, RECURRING_CONFIRMATION_CHECKSUM) ||
      !isAppliedNamedMigration(staffLedgerAfter, STAFF_MEMBER_LINK_CHECKSUM)) {
    abort("spa_member_staff_final_schema_rejected");
  }
  log("spa_member_staff_final_schema_verified");
}

export function isAppliedTransactionConversionSnapshotMigration(row) {
  return row?.checksum === TRANSACTION_CONVERSION_SNAPSHOT_CHECKSUM &&
    row.finishedAt !== null && row.rolledBackAt === null;
}

export function isAppliedPaymentSplitRlsMigration(row) {
  return row?.checksum === PAYMENT_SPLIT_RLS_CHECKSUM &&
    row.finishedAt !== null && row.rolledBackAt === null;
}

async function runPaymentSplitRlsMigration(prisma) {
  const initialStatus = runPrisma(["migrate", "status"]);
  if (isStatusUpToDate(initialStatus)) {
    const [current, ledger] = await Promise.all([
      readPaymentSplitSnapshot(prisma), readPaymentSplitRlsLedger(prisma),
    ]);
    if (!hasExpectedPaymentSplitSchema(current) ||
        !hasExpectedPaymentSplitRls(current, true) ||
        !isAppliedPaymentSplitRlsMigration(ledger)) {
      abort("payment_split_rls_applied_state_rejected");
    }
    log("payment_split_rls_already_applied_verified");
    return;
  }
  if (initialStatus.exitCode !== 1 || !hasOnlyPaymentSplitRlsPending(initialStatus.output)) {
    abort("payment_split_rls_pending_allowlist_rejected");
  }
  const before = await readPaymentSplitSnapshot(prisma);
  if (!hasExpectedPaymentSplitSchema(before) || !hasExpectedPaymentSplitRls(before, false)) {
    abort("payment_split_rls_preflight_rejected");
  }
  log("payment_split_rls_preflight_verified");
  log("payment_split_rls_deploy_started");
  if (runPrisma(["migrate", "deploy"]).exitCode !== 0) abort("payment_split_rls_deploy_failed");
  log("payment_split_rls_deploy_succeeded");
  const finalStatus = runPrisma(["migrate", "status"]);
  if (!isStatusUpToDate(finalStatus)) abort("payment_split_rls_final_status_rejected");
  const [after, ledger] = await Promise.all([
    readPaymentSplitSnapshot(prisma), readPaymentSplitRlsLedger(prisma),
  ]);
  if (!hasExpectedPaymentSplitSchema(after) ||
      !hasExpectedPaymentSplitRls(after, true) ||
      !isAppliedPaymentSplitRlsMigration(ledger)) {
    abort("payment_split_rls_final_schema_rejected");
  }
  log("payment_split_rls_final_schema_verified");
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

async function runTransactionConversionSnapshotMigration(prisma) {
  const initialStatus = runPrisma(["migrate", "status"]);
  if (isStatusUpToDate(initialStatus)) {
    const [columns, ledger] = await Promise.all([
      readTransactionConversionSnapshot(prisma),
      readTransactionConversionSnapshotLedger(prisma),
    ]);
    if (!hasExpectedTransactionConversionSnapshotColumns(columns) ||
        !isAppliedTransactionConversionSnapshotMigration(ledger)) {
      abort("transaction_conversion_snapshot_applied_state_rejected");
    }
    log("transaction_conversion_snapshot_already_applied_verified");
    return;
  }
  if (initialStatus.exitCode !== 1 ||
      !hasOnlyTransactionConversionSnapshotPending(initialStatus.output)) {
    abort("transaction_conversion_snapshot_pending_allowlist_rejected");
  }
  const before = await readTransactionConversionSnapshot(prisma);
  if (!hasNoTransactionConversionSnapshotColumns(before)) {
    abort("transaction_conversion_snapshot_preflight_rejected");
  }
  log("transaction_conversion_snapshot_preflight_verified");
  log("transaction_conversion_snapshot_deploy_started");
  if (runPrisma(["migrate", "deploy"]).exitCode !== 0) {
    abort("transaction_conversion_snapshot_deploy_failed");
  }
  log("transaction_conversion_snapshot_deploy_succeeded");
  const finalStatus = runPrisma(["migrate", "status"]);
  if (!isStatusUpToDate(finalStatus)) abort("transaction_conversion_snapshot_final_status_rejected");
  const [after, ledger] = await Promise.all([
    readTransactionConversionSnapshot(prisma),
    readTransactionConversionSnapshotLedger(prisma),
  ]);
  if (!hasExpectedTransactionConversionSnapshotColumns(after) ||
      !isAppliedTransactionConversionSnapshotMigration(ledger)) {
    abort("transaction_conversion_snapshot_final_schema_rejected");
  }
  log("transaction_conversion_snapshot_final_schema_verified");
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

  if (target === SPA_MEMBER_STAFF_RELEASE_TARGET) {
    prepareSpaProductionHistory();
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL } },
  });
  try {
    if (target === HUMAN_SUPPORT_SUMMARY_MIGRATION) {
      await runHumanSupportSummaryMigration(prisma);
      return;
    }
    if (target === PAYMENT_SPLIT_RLS_MIGRATION) {
      await runPaymentSplitRlsMigration(prisma);
      return;
    }
    if (target === TRANSACTION_CONVERSION_SNAPSHOT_MIGRATION) {
      await runTransactionConversionSnapshotMigration(prisma);
      return;
    }
    if (target === SPA_MEMBER_STAFF_RELEASE_TARGET) {
      await runSpaMemberStaffRelease(prisma);
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
