import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const EXPECTED_ENVIRONMENT = "production";
const EXPECTED_PROJECT_REF = "qijlnhtpbintanzpxkvf";
export const MESSENGER_MIGRATION =
  "20260729090000_add_messenger_audit_runs";
export const PAYMENT_SPLIT_MIGRATION =
  "20260801090000_add_transaction_payment_splits";
export const EXPECTED_FAILED_CHECKSUM =
  "6edbd88d9fd2ab9e368b963d21f7d90ef2ed1f8e8c467a29c20f9a3c8d8e1488";
const MIGRATION_FILE = `prisma/migrations/${MESSENGER_MIGRATION}/migration.sql`;

function abort(message) {
  console.error(`messenger-reconciliation: abort: ${message}`);
  process.exit(1);
}

function projectRefFromConnectionString(value, variableName, expectedPort) {
  if (!value) abort(`${variableName} is missing in the Production build environment`);

  let url;
  try {
    url = new URL(value);
  } catch {
    abort(`${variableName} is not a valid PostgreSQL connection string`);
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    abort(`${variableName} does not use a PostgreSQL protocol`);
  }
  if (url.port !== expectedPort) {
    abort(`${variableName} is not using its approved pooler port`);
  }

  const match = url.username.match(/^postgres\.([a-z0-9]+)$/);
  if (!match) abort(`${variableName} does not identify a Supabase project ref`);
  return match[1];
}

function runPrisma(args, allowFailure = false) {
  try {
    return {
      exitCode: 0,
      output: execFileSync("npx", ["prisma", ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (error) {
    if (allowFailure) {
      return {
        exitCode: error.status ?? 1,
        output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
      };
    }
    abort(`prisma ${args.join(" ")} failed`);
  }
}

export function migrationChecksum() {
  return createHash("sha256").update(readFileSync(MIGRATION_FILE)).digest("hex");
}

export function hasExpectedFailedMigration(statusOutput) {
  return (
    statusOutput.includes(MESSENGER_MIGRATION) &&
    /failed migration|migration failed/i.test(statusOutput)
  );
}

export function hasExpectedMigrationLedger(rows, failedMigrationNames) {
  return (
    rows.length === 1 &&
    rows[0].migrationName === MESSENGER_MIGRATION &&
    rows[0].checksum === EXPECTED_FAILED_CHECKSUM &&
    rows[0].finishedAt === null &&
    rows[0].rolledBackAt === null &&
    rows[0].appliedStepsCount === 0 &&
    rows[0].logs?.includes("MessengerAuditStatus") &&
    failedMigrationNames.length === 1 &&
    failedMigrationNames[0] === MESSENGER_MIGRATION
  );
}

export function hasOnlyPaymentSplitPending(statusOutput) {
  const header = "Following migrations have not yet been applied:";
  const start = statusOutput.indexOf(header);
  if (start === -1) return false;

  const pendingSection = statusOutput.slice(start + header.length);
  return (
    pendingSection.includes(PAYMENT_SPLIT_MIGRATION) &&
    !pendingSection.includes(MESSENGER_MIGRATION) &&
    !/\n\s*\d{14}_[\w-]+\s*\n/.test(
      pendingSection.replace(PAYMENT_SPLIT_MIGRATION, ""),
    )
  );
}

export function hasExpectedMessengerSchema(introspection) {
  return [
    /enum MessengerAuditStatus\s*\{[\s\S]*RUNNING[\s\S]*COMPLETED[\s\S]*COMPLETED_WITH_ERRORS[\s\S]*FAILED[\s\S]*\}/,
    /model MessengerAuditRun\s*\{[\s\S]*id\s+String\s+@id[\s\S]*storeId\s+String[\s\S]*requestedByUserId\s+String/,
    /createdAt\s+DateTime\s+@default\(now\(\)\)/,
    /configuredFields\s+String\[\]\s+@default\(\[\]\)/,
    /missingFields\s+String\[\]\s+@default\(\[\]\)/,
    /@@index\(\[storeId, createdAt\], map: "MessengerAuditRun_storeId_createdAt_idx"\)/,
    /@@index\(\[requestedByUserId, createdAt\], map: "MessengerAuditRun_requestedByUserId_createdAt_idx"\)/,
  ].every((pattern) => pattern.test(introspection));
}

function assertProductionConnection() {
  if (process.env.VERCEL_ENV !== EXPECTED_ENVIRONMENT) {
    abort("only Vercel Production may run reconciliation");
  }
  if (process.argv.length !== 2) abort("this single-purpose tool accepts no arguments");

  const databaseRef = projectRefFromConnectionString(
    process.env.DATABASE_URL,
    "DATABASE_URL",
    "6543",
  );
  const directRef = projectRefFromConnectionString(
    process.env.DIRECT_URL,
    "DIRECT_URL",
    "5432",
  );
  if (databaseRef !== EXPECTED_PROJECT_REF || directRef !== EXPECTED_PROJECT_REF) {
    abort("connection strings do not both target the approved Production project");
  }
}

async function main() {
  assertProductionConnection();
  if (migrationChecksum() !== EXPECTED_FAILED_CHECKSUM) {
    abort("migration SQL checksum differs from the expected failed migration record");
  }

  const prisma = new PrismaClient();
  const ledgerRows = await prisma.prismaMigrationLedger.findMany({
    where: {
      migrationName: {
        in: [MESSENGER_MIGRATION, "20260728201305_add_messenger_audit_runs", PAYMENT_SPLIT_MIGRATION],
      },
    },
    select: {
      migrationName: true,
      checksum: true,
      startedAt: true,
      finishedAt: true,
      rolledBackAt: true,
      appliedStepsCount: true,
      logs: true,
    },
  });
  const failedRows = await prisma.prismaMigrationLedger.findMany({
    where: { finishedAt: null, rolledBackAt: null },
    select: { migrationName: true },
  });
  if (
    !hasExpectedMigrationLedger(
      ledgerRows,
      failedRows.map((row) => row.migrationName),
    )
  ) {
    await prisma.$disconnect();
    abort("Prisma migration ledger is not the approved failed Messenger state");
  }

  const before = runPrisma(["migrate", "status"], true);
  if (before.exitCode !== 1 || !hasExpectedFailedMigration(before.output)) {
    await prisma.$disconnect();
    abort("Prisma failed migration state is not the expected Messenger migration");
  }

  const introspection = runPrisma(["db", "pull", "--print"], true);
  if (introspection.exitCode !== 0 || !hasExpectedMessengerSchema(introspection.output)) {
    await prisma.$disconnect();
    abort("Messenger schema does not exactly match the approved reconciliation shape");
  }

  console.log("messenger-reconciliation: resolving the fixed Messenger migration");
  await prisma.$disconnect();
  runPrisma(["migrate", "resolve", "--applied", MESSENGER_MIGRATION]);

  const after = runPrisma(["migrate", "status"], true);
  if (after.exitCode !== 1 || !hasOnlyPaymentSplitPending(after.output)) {
    abort("expected only the payment-split migration after reconciliation");
  }
  console.log("messenger-reconciliation: complete; payment split remains pending");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => abort("reconciliation verification failed"));
}
