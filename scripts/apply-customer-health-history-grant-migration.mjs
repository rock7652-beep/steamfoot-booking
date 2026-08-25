import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const MIGRATION = "20260825133000_add_customer_health_history_grants";
const BUSINESS_HOURS_MIGRATION = "20260821170000_add_business_hour_segments";
const NATIVE_HEALTH_MIGRATION = "20260824150000_add_native_customer_health_records";
const EXPECTED_PROJECT_REF = "qijlnhtpbintanzpxkvf";

function fail(code) {
  console.error(`health-grant-migration: aborted code=${code}`);
  process.exit(1);
}

function projectRef(value) {
  try {
    const url = new URL(value);
    return url.username.match(/^postgres\.([a-z0-9]+)$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

if (process.env.CONFIRMATION !== "APPLY_CUSTOMER_HEALTH_HISTORY_GRANT_MIGRATION") fail("confirmation_rejected");
if (projectRef(process.env.DIRECT_URL) !== EXPECTED_PROJECT_REF) fail("production_connection_rejected");

const env = { ...process.env, DATABASE_URL: process.env.DIRECT_URL, DIRECT_URL: process.env.DIRECT_URL };

function runPrisma(args, inherit = false) {
  try {
    const output = execFileSync("npx", ["prisma", ...args], {
      env,
      encoding: "utf8",
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    return { exitCode: 0, output: output ?? "" };
  } catch (error) {
    return { exitCode: error.status ?? 1, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

function pendingMigrations() {
  return runPrisma(["migrate", "status"]).output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d{14}_[A-Za-z0-9_-]+$/.test(line));
}

let pending = pendingMigrations();
const allowedPendingStates = [
  [BUSINESS_HOURS_MIGRATION, NATIVE_HEALTH_MIGRATION, MIGRATION],
  [NATIVE_HEALTH_MIGRATION, MIGRATION],
  [MIGRATION],
];
if (!allowedPendingStates.some((state) => JSON.stringify(state) === JSON.stringify(pending))) {
  console.error(`health-grant-migration: pending=${pending.join(",") || "none"}`);
  fail("pending_migration_allowlist_rejected");
}

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
try {
  if (pending.includes(BUSINESS_HOURS_MIGRATION)) {
    const columns = await prisma.$queryRawUnsafe(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND (
        (table_name = 'BusinessHours' AND column_name = 'segments') OR
        (table_name = 'SpecialBusinessDay' AND column_name = 'segments') OR
        (table_name = 'ShopConfig' AND column_name IN ('bookingOpensAt', 'bookingWindowDays'))
      )
    `);
    const fingerprint = new Map(columns.map((row) => [`${row.table_name}.${row.column_name}`, row]));
    if (
      fingerprint.get("BusinessHours.segments")?.data_type !== "jsonb" ||
      fingerprint.get("SpecialBusinessDay.segments")?.data_type !== "jsonb" ||
      fingerprint.get("ShopConfig.bookingOpensAt")?.data_type !== "timestamp without time zone" ||
      fingerprint.get("ShopConfig.bookingWindowDays")?.data_type !== "integer" ||
      fingerprint.get("ShopConfig.bookingWindowDays")?.is_nullable !== "NO"
    ) fail("business_hours_schema_fingerprint_rejected");
    if (runPrisma(["migrate", "resolve", "--applied", BUSINESS_HOURS_MIGRATION], true).exitCode !== 0) {
      fail("business_hours_ledger_reconciliation_failed");
    }
    console.log("health-grant-migration: business_hours_ledger_reconciled");
  }

  if (pending.includes(NATIVE_HEALTH_MIGRATION)) {
    const [columns, indexes, constraints, rls, records] = await Promise.all([
      prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'CustomerHealthRecord'`),
      prisma.$queryRawUnsafe(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'CustomerHealthRecord'`),
      prisma.$queryRawUnsafe(`SELECT conname FROM pg_constraint WHERE conrelid = 'public."CustomerHealthRecord"'::regclass`),
      prisma.$queryRawUnsafe(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public."CustomerHealthRecord"'::regclass`),
      prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "CustomerHealthRecord"`),
    ]);
    const expectedIndexes = [
      "CustomerHealthRecord_pkey",
      "CustomerHealthRecord_source_sourceRecordId_key",
      "CustomerHealthRecord_storeId_measuredAt_idx",
      "CustomerHealthRecord_storeId_customerId_measuredAt_idx",
      "CustomerHealthRecord_customerId_measuredAt_idx",
    ];
    const expectedConstraints = [
      "CustomerHealthRecord_pkey",
      "CustomerHealthRecord_storeId_fkey",
      "CustomerHealthRecord_customerId_fkey",
    ];
    const indexNames = new Set(indexes.map((row) => row.indexname));
    const constraintNames = new Set(constraints.map((row) => row.conname));
    if (
      columns[0]?.count !== 18 ||
      !expectedIndexes.every((name) => indexNames.has(name)) ||
      !expectedConstraints.every((name) => constraintNames.has(name)) ||
      rls[0]?.relrowsecurity !== true ||
      records[0]?.count < 1
    ) fail("native_health_schema_fingerprint_rejected");
    console.log(`health-grant-migration: native_health_records_verified count=${records[0].count}`);
    if (runPrisma(["migrate", "resolve", "--applied", NATIVE_HEALTH_MIGRATION], true).exitCode !== 0) {
      fail("native_health_ledger_reconciliation_failed");
    }
    console.log("health-grant-migration: native_health_ledger_reconciled");
  }
} finally {
  await prisma.$disconnect();
}

pending = pendingMigrations();
if (pending.length !== 1 || pending[0] !== MIGRATION) {
  console.error(`health-grant-migration: post_reconciliation_pending=${pending.join(",") || "none"}`);
  fail("post_reconciliation_allowlist_rejected");
}

const preflight = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
try {
  const before = await preflight.$queryRawUnsafe(`SELECT to_regclass('public."CustomerHealthHistoryGrant"')::text AS table_name`);
  if (before[0]?.table_name !== null) fail("preexisting_table_rejected");
} finally {
  await preflight.$disconnect();
}

console.log("health-grant-migration: guarded_deploy_started");
if (runPrisma(["migrate", "deploy"], true).exitCode !== 0) fail("deploy_failed");

const verify = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
try {
  const [table, ledger, rls] = await Promise.all([
    verify.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'CustomerHealthHistoryGrant'`),
    verify.$queryRawUnsafe(`SELECT finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1`, MIGRATION),
    verify.$queryRawUnsafe(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public."CustomerHealthHistoryGrant"'::regclass`),
  ]);
  if (table[0]?.count !== 8 || !ledger[0]?.finished_at || ledger[0]?.rolled_back_at || rls[0]?.relrowsecurity !== true) {
    fail("final_schema_verification_failed");
  }
  console.log("health-grant-migration: final_schema_verified");
} finally {
  await verify.$disconnect();
}
