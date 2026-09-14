import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  migrationChecksum,
  projectRefFromConnectionString,
} from "./ci-migrate.mjs";

const EXPECTED_PROJECT_REF = "qijlnhtpbintanzpxkvf";
const EXPECTED_ENVIRONMENT = "production";
const RECONCILE_CONFIRMATION = "RECONCILE_SUPERSEDED_SPA_HISTORY";
const RECONCILIATION_LOCK = 2026090115n;
const FINGERPRINT_FILE = "prisma/reconciliation/spa-release-fingerprint.sql";
const RELEASE_SCHEMA_FILE = "prisma/reconciliation/spa-release-schema.sql";
const RESOURCE_CONSTRAINTS_FILE = "prisma/reconciliation/spa-booking-resource-constraints.sql";

export const SUPERSEDED_SPA_MIGRATIONS = [
  ["20260828141500_add_spa_treatments_skills_availability", "3476e614e0ad94e5b0c6c8600d774bf1a99f6dffe73a2c5b7fd8791eec0a501a"],
  ["20260830093000_add_spa_stored_value_wallet", "6e378397e446d99b7b08be1a24adf61a3cbf8fbed5e5c2e1b2a8171147a72e3f"],
  ["20260831140000_add_spa_staff_compensation", "5acd2291d5d12bfe40d0833e649546f7c786712d16e029ab304f815e6c09e7d2"],
  ["20260901110000_add_isolated_spa_models", "3aa07c29d74f873330684ad7df3c5d9127024b0b0f968812ded0beef275a6e1d"],
  ["20260901123000_add_store_industry_module", "122833ba641dc3de3f531e4dac9ab451d2c8726c9967e2464e04cdb63ea0a69f"],
  ["20260901153000_cutover_spa_operational_models", "7f4d31438b95457c06e3f7cedf40389083e14b9574c81b71499f53377e51d300"],
  ["20260901154500_remove_legacy_spa_shared_schema", "82c6decf83583550e2768af26fa266ad06f6102b2df66294636dce4fae93c0ab"],
  ["20260903120000_backfill_spa_payments", "eaee8d6e128ad5f43f1079a956a94820569fac017ee932b733f8d984bee0e290"],
];

const REQUIRED_FINAL_TABLES = [
  "SpaBooking", "SpaBookingGroup", "SpaBookingItem", "SpaCreditSale",
  "SpaEntitlement", "SpaEntitlementUse", "SpaPackage", "SpaPayment",
  "SpaPaymentRevision", "SpaReceipt", "SpaRefund", "SpaServiceLocation",
  "SpaSkill", "SpaStaffAvailability", "SpaStaffAvailabilityException",
  "SpaStaffCompensation", "SpaStaffSkill", "SpaStoredValueEntry",
  "SpaStoredValueWallet", "SpaTreatment", "SpaTreatmentServiceLocation",
  "SpaTreatmentSkill", "StoreModuleInstallation",
];

const RETIRED_SHARED_TABLES = [
  "ProfessionalSkill", "Treatment", "TreatmentSkill", "StaffSkill",
  "StaffWeeklyAvailability", "StaffAvailabilityException",
  "StoredValueWallet", "StoredValueLedgerEntry",
];

const FIREWALL_TABLES = [
  "Booking", "ServicePlan", "CustomerPlanWallet", "Transaction",
  "SpaBooking", "SpaBookingItem", "SpaEntitlement", "SpaEntitlementUse",
  "SpaPayment", "SpaStoredValueWallet", "SpaStoredValueEntry", "SpaTreatment",
  "SpaSkill", "SpaTreatmentSkill", "SpaStaffSkill", "SpaStaffAvailability",
  "SpaStaffAvailabilityException", "SpaStaffCompensation",
];

const REQUIRED_CONSTRAINTS = [...new Set(
  [RELEASE_SCHEMA_FILE, RESOURCE_CONSTRAINTS_FILE].flatMap((path) =>
    [...readFileSync(path, "utf8").matchAll(/CONSTRAINT "([^"]+)"/g)].map((match) => match[1])
  ),
)].sort();

export function parseReadinessArgs(args) {
  if (args.length === 1 && args[0] === "--inspect") return { mode: "inspect" };
  if (args.length === 2 && args[0] === "--reconcile-superseded" &&
      args[1] === `--confirm=${RECONCILE_CONFIRMATION}`) {
    return { mode: "reconcile" };
  }
  throw new Error("INVALID_ARGUMENTS");
}

export function splitFingerprintStatements(sql) {
  const statements = sql.match(/DO \$\$[\s\S]*?END \$\$;/g) ?? [];
  if (statements.length === 0 || sql.replaceAll(/DO \$\$[\s\S]*?END \$\$;/g, "").replaceAll(/--[^\n]*/g, "").trim()) {
    throw new Error("FINGERPRINT_PARSE_FAILED");
  }
  return statements;
}

export function classifyMigrationRows(rows, checksum) {
  if (rows.length === 0) return "missing";
  if (rows.length !== 1) return "invalid";
  const row = rows[0];
  return row.checksum === checksum && row.finishedAt !== null && row.rolledBackAt === null
    ? "applied"
    : "invalid";
}

function assertProductionConnection() {
  if (process.env.VERCEL_ENV !== EXPECTED_ENVIRONMENT ||
      projectRefFromConnectionString(process.env.DATABASE_URL, "6543") !== EXPECTED_PROJECT_REF ||
      projectRefFromConnectionString(process.env.DIRECT_URL, "5432") !== EXPECTED_PROJECT_REF) {
    throw new Error("PRODUCTION_CONNECTION_REJECTED");
  }
}

function verifyRepositoryChecksums() {
  for (const [name, checksum] of SUPERSEDED_SPA_MIGRATIONS) {
    const path = `prisma/migrations/${name}/migration.sql`;
    if (migrationChecksum(path) !== checksum) throw new Error("MIGRATION_CHECKSUM_MISMATCH");
  }
}

async function runFinalSchemaFingerprint(prisma) {
  const statements = splitFingerprintStatements(readFileSync(FINGERPRINT_FILE, "utf8"));
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '120s'");
    for (const statement of statements) await tx.$executeRawUnsafe(statement);
  }, { maxWait: 5_000, timeout: 180_000 });
}

async function readContract(prisma) {
  const [tables, rls, grants, stores, modules, firewalls, functionDetails, functionGrants, constraints, extension, ledger] = await Promise.all([
    prisma.$queryRaw`SELECT tablename AS "name" FROM pg_tables WHERE schemaname = 'public'`,
    prisma.$queryRaw`SELECT c.relname AS "name", c.relrowsecurity AS "enabled" FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = ANY(${REQUIRED_FINAL_TABLES})`,
    prisma.$queryRaw`SELECT table_name AS "name", count(*)::int AS "count" FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = ANY(${REQUIRED_FINAL_TABLES}) AND grantee IN ('anon', 'authenticated') GROUP BY table_name`,
    prisma.$queryRaw`SELECT count(*)::int AS "total", count(*) FILTER (WHERE "industryModule"::text = 'STEAMFOOT')::int AS "steamfoot", count(*) FILTER (WHERE "industryModule"::text = 'SPA')::int AS "spa", count(*) FILTER (WHERE id = 'demo-store')::int AS "demo" FROM "Store"`,
    prisma.$queryRaw`SELECT column_name AS "columnName", data_type AS "dataType", udt_name AS "udtName", is_nullable AS "isNullable", column_default AS "columnDefault" FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Store' AND column_name = 'industryModule'`,
    prisma.$queryRaw`SELECT event_object_table AS "name" FROM information_schema.triggers WHERE trigger_schema = 'public' AND trigger_name = 'module_firewall' GROUP BY event_object_table`,
    prisma.$queryRaw`SELECT p.prosecdef AS "securityDefiner", p.proconfig AS "config" FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'assert_store_module'`,
    prisma.$queryRaw`SELECT count(*)::int AS "count" FROM information_schema.routine_privileges WHERE specific_schema = 'public' AND routine_name = 'assert_store_module' AND grantee IN ('PUBLIC', 'anon', 'authenticated')`,
    prisma.$queryRaw`SELECT conname AS "name" FROM pg_constraint WHERE conname = ANY(${REQUIRED_CONSTRAINTS})`,
    prisma.$queryRaw`SELECT count(*)::int AS "count" FROM pg_extension WHERE extname = 'btree_gist'`,
    prisma.$queryRaw`SELECT migration_name AS "migrationName", checksum, finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt" FROM "_prisma_migrations" WHERE migration_name = ANY(${SUPERSEDED_SPA_MIGRATIONS.map(([name]) => name)}) ORDER BY migration_name`,
  ]);
  return { tables, rls, grants, stores: stores[0], modules, firewalls, functionDetails, functionGrants, constraints, extension, ledger };
}

export function validateContract(contract) {
  const tables = new Set(contract.tables.map((row) => row.name));
  if (!REQUIRED_FINAL_TABLES.every((name) => tables.has(name)) ||
      RETIRED_SHARED_TABLES.some((name) => tables.has(name))) return false;
  if (contract.rls.length !== REQUIRED_FINAL_TABLES.length ||
      contract.rls.some((row) => row.enabled !== true) || contract.grants.length !== 0) return false;
  if (contract.modules.length !== 1 || contract.modules[0].udtName !== "IndustryModule" ||
      contract.modules[0].isNullable !== "NO") return false;
  if (contract.stores?.total !== 3 || contract.stores?.steamfoot !== 3 ||
      contract.stores?.spa !== 0 || contract.stores?.demo !== 0) return false;
  const firewalls = new Set(contract.firewalls.map((row) => row.name));
  const functionDetail = contract.functionDetails[0];
  if (!FIREWALL_TABLES.every((name) => firewalls.has(name)) ||
      contract.functionDetails.length !== 1 || functionDetail.securityDefiner !== true ||
      !(functionDetail.config ?? []).includes("search_path=pg_catalog, public") ||
      contract.functionGrants[0]?.count !== 0) return false;
  const constraints = new Set(contract.constraints.map((row) => row.name));
  if (!REQUIRED_CONSTRAINTS.every((name) => constraints.has(name)) ||
      contract.extension[0]?.count !== 1) return false;
  const rowsByName = new Map();
  for (const row of contract.ledger) {
    const rows = rowsByName.get(row.migrationName) ?? [];
    rows.push(row);
    rowsByName.set(row.migrationName, rows);
  }
  return SUPERSEDED_SPA_MIGRATIONS.every(([name, checksum]) =>
    classifyMigrationRows(rowsByName.get(name) ?? [], checksum) !== "invalid"
  );
}

function prismaResolveEnv() {
  return {
    ...process.env,
    DATABASE_URL: process.env.DIRECT_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    PGOPTIONS: "-c lock_timeout=5s -c statement_timeout=120s",
  };
}

async function reconcileMissingHistory(prisma, contract) {
  const byName = new Map(contract.ledger.map((row) => [row.migrationName, row]));
  const missing = SUPERSEDED_SPA_MIGRATIONS.filter(([name]) => !byName.has(name));
  await prisma.$transaction(async (tx) => {
    const lock = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${RECONCILIATION_LOCK}) AS "locked"`;
    if (lock[0]?.locked !== true) throw new Error("RECONCILIATION_LOCK_UNAVAILABLE");
    for (const [name] of missing) {
      execFileSync("npx", ["prisma", "migrate", "resolve", "--applied", name], {
        stdio: ["ignore", "pipe", "pipe"],
        env: prismaResolveEnv(),
      });
    }
  }, { maxWait: 5_000, timeout: 180_000 });
  return missing.map(([name]) => name);
}

async function main() {
  const input = parseReadinessArgs(process.argv.slice(2));
  assertProductionConnection();
  verifyRepositoryChecksums();
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
  try {
    await runFinalSchemaFingerprint(prisma);
    const before = await readContract(prisma);
    if (!validateContract(before)) throw new Error("PRODUCTION_SCHEMA_CONTRACT_REJECTED");
    if (input.mode === "inspect") {
      console.log("SPA_PRODUCTION_HISTORY_INSPECTION_READY");
      return;
    }
    const reconciled = await reconcileMissingHistory(prisma, before);
    const after = await readContract(prisma);
    if (!validateContract(after) || SUPERSEDED_SPA_MIGRATIONS.some(([name, checksum]) => {
      const rows = after.ledger.filter((row) => row.migrationName === name);
      return classifyMigrationRows(rows, checksum) !== "applied";
    })) throw new Error("RECONCILIATION_POSTCONDITION_FAILED");
    console.log(`SPA_PRODUCTION_HISTORY_RECONCILED count=${reconciled.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`spa-production-readiness: ${error.message}`);
    process.exitCode = 1;
  });
}
