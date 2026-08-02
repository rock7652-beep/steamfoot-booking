import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

export const RECONCILIATION_SEQUENCE = [
  "20260729090000_add_messenger_audit_runs",
  "20260801090000_add_transaction_payment_splits",
] as const;
export const AUDIT_RUN_MIGRATION = RECONCILIATION_SEQUENCE[0];
export const RLS_CONFIRMATION = "REPAIR_MESSENGER_AUDIT_RUN_RLS";
export const RESOLVE_CONFIRMATION = "RESOLVE_MESSENGER_AUDIT_RUN_MIGRATION";

export type ReconciliationCode =
  | "SCHEMA_CONTRACT_OK"
  | "RLS_REPAIR_READY"
  | "RLS_REPAIRED"
  | "ALREADY_SECURED"
  | "RESOLVE_READY"
  | "RESOLVED"
  | "PRECONDITION_FAILED"
  | "CONFIRMATION_REQUIRED"
  | "PRODUCTION_ENV_REQUIRED";

type Snapshot = {
  columns: Array<{ name: string; type: string; nullable: boolean; defaultValue: string | null; udt: string }>;
  indexes: Array<{ name: string; definition: string }>;
  constraints: Array<{ name: string; definition: string }>;
  rlsEnabled: boolean;
  rlsForced: boolean;
  policyCount: number;
  rowCount: number;
};

const REQUIRED_COLUMNS: Record<string, readonly [string, boolean, string]> = {
  id: ["text", false, "text"], storeId: ["text", false, "text"], requestedByUserId: ["text", false, "text"],
  createdAt: ["timestamp without time zone", false, "timestamp"], completedAt: ["timestamp without time zone", true, "timestamp"],
  status: ["USER-DEFINED", false, "MessengerAuditStatus"], appValidated: ["boolean", true, "bool"],
  pageTokenMatches: ["boolean", true, "bool"], callbackMatches: ["boolean", true, "bool"], configuredFields: ["ARRAY", false, "_text"],
  missingFields: ["ARRAY", false, "_text"], pageAttached: ["boolean", true, "bool"], callsSafeSummary: ["jsonb", true, "jsonb"], errorCode: ["text", true, "text"],
};
const REQUIRED_INDEXES = [
  "MessengerAuditRun_pkey",
  "MessengerAuditRun_storeId_createdAt_idx",
  "MessengerAuditRun_requestedByUserId_createdAt_idx",
];
const REQUIRED_CONSTRAINTS = [
  "MessengerAuditRun_storeId_fkey",
  "MessengerAuditRun_requestedByUserId_fkey",
];

export function hasSchemaContract(snapshot: Snapshot) {
  return (
    Object.entries(REQUIRED_COLUMNS).every(([name, [type, nullable, udt]]) => snapshot.columns.some((column) => column.name === name && column.type === type && column.nullable === nullable && column.udt === udt)) &&
    REQUIRED_INDEXES.every((name) => snapshot.indexes.some((index) => index.name === name && index.definition.includes('"MessengerAuditRun"'))) &&
    REQUIRED_CONSTRAINTS.every((name) => snapshot.constraints.some((constraint) => constraint.name === name && constraint.definition.includes('FOREIGN KEY')))
  );
}

export function safeRlsState(snapshot: Snapshot) {
  return hasSchemaContract(snapshot) && snapshot.rlsEnabled && snapshot.rlsForced && snapshot.policyCount === 0;
}

export type MigrationHistoryRecord = {
  migrationName: string;
  checksum: string;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
  appliedStepsCount: number;
};

export function repositoryMigrationChecksum() {
  return createHash("sha256")
    .update(readFileSync(resolve("prisma/migrations", AUDIT_RUN_MIGRATION, "migration.sql")))
    .digest("hex");
}

export function hasResolvePreconditions(records: MigrationHistoryRecord[], statusOutput: string) {
  const [record] = records;
  const mentioned = statusOutput.match(/20\d{12}_[a-z0-9_]+/g) ?? [];
  return (
    records.length === 1 &&
    record.migrationName === AUDIT_RUN_MIGRATION &&
    record.checksum === repositoryMigrationChecksum() &&
    record.finishedAt === null &&
    record.rolledBackAt === null &&
    record.appliedStepsCount === 0 &&
    mentioned.length === 2 &&
    mentioned[0] === AUDIT_RUN_MIGRATION &&
    mentioned[1] === RECONCILIATION_SEQUENCE[1] &&
    /failed/i.test(statusOutput) &&
    /pending|not yet been applied/i.test(statusOutput)
  );
}

function requireProduction() {
  if (process.env.VERCEL_ENV !== "production") throw new Error("PRODUCTION_ENV_REQUIRED");
  const directUrl = process.env.DIRECT_URL;
  if (!process.env.DATABASE_URL || !directUrl) throw new Error("PRECONDITION_FAILED");
  const parsed = new URL(directUrl);
  if (!["5432", "6543"].includes(parsed.port) || !parsed.username.startsWith("postgres.")) throw new Error("PRECONDITION_FAILED");
}

async function snapshot(prisma: PrismaClient): Promise<Snapshot> {
  const [columns, indexes, constraints, rls, policies, rowCount] = await Promise.all([
    prisma.$queryRaw<Array<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null; udt_name: string }>>`SELECT column_name, data_type, is_nullable, column_default, udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'MessengerAuditRun'`,
    prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'MessengerAuditRun'`,
    prisma.$queryRaw<Array<{ conname: string; definition: string }>>`SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'public."MessengerAuditRun"'::regclass`,
    prisma.$queryRaw<Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>>`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'public."MessengerAuditRun"'::regclass`,
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM pg_policies WHERE schemaname = 'public' AND tablename = 'MessengerAuditRun'`,
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM "MessengerAuditRun"`,
  ]);
  return {
    columns: columns.map((column) => ({ name: column.column_name, type: column.data_type, nullable: column.is_nullable === "YES", defaultValue: column.column_default, udt: column.udt_name })),
    indexes: indexes.map(({ indexname, indexdef }) => ({ name: indexname, definition: indexdef })),
    constraints: constraints.map(({ conname, definition }) => ({ name: conname, definition })),
    rlsEnabled: rls[0]?.relrowsecurity === true,
    rlsForced: rls[0]?.relforcerowsecurity === true,
    policyCount: Number(policies[0]?.count ?? -1),
    rowCount: Number(rowCount[0]?.count ?? -1),
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const stage = args.has("--stage=resolve-audit-run") ? "resolve" : args.has("--stage=repair-rls") ? "repair" : "inspect";
  const apply = args.has("--apply");
  const confirmation = [...args].find((value) => value.startsWith("--confirm="))?.slice(10);
  requireProduction();
  const prisma = new PrismaClient();
  try {
    const before = await snapshot(prisma);
    if (!hasSchemaContract(before) || before.policyCount !== 0) throw new Error("PRECONDITION_FAILED");
    if (stage === "inspect") return console.log(before.rlsEnabled && before.rlsForced ? "ALREADY_SECURED" : "RLS_REPAIR_READY");
    if (stage === "repair") {
      if (before.rlsEnabled && before.rlsForced) return console.log("ALREADY_SECURED");
      if (!apply || confirmation !== RLS_CONFIRMATION) throw new Error("CONFIRMATION_REQUIRED");
      await prisma.$executeRaw`ALTER TABLE "MessengerAuditRun" ENABLE ROW LEVEL SECURITY`;
      await prisma.$executeRaw`ALTER TABLE "MessengerAuditRun" FORCE ROW LEVEL SECURITY`;
      const after = await snapshot(prisma);
      if (!safeRlsState(after) || after.rowCount !== before.rowCount) throw new Error("PRECONDITION_FAILED");
      return console.log("RLS_REPAIRED");
    }
    if (!safeRlsState(before) || !apply || confirmation !== RESOLVE_CONFIRMATION) throw new Error("CONFIRMATION_REQUIRED");
    const records = await prisma.$queryRaw<Array<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null; applied_steps_count: number }>>`SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM "_prisma_migrations" WHERE migration_name = ${AUDIT_RUN_MIGRATION}`;
    let status: string;
    try {
      status = execFileSync("npx", ["prisma", "migrate", "status"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      const result = error as { stdout?: string; stderr?: string };
      status = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    }
    if (!hasResolvePreconditions(records.map((record) => ({ migrationName: record.migration_name, checksum: record.checksum, finishedAt: record.finished_at, rolledBackAt: record.rolled_back_at, appliedStepsCount: record.applied_steps_count })), status)) throw new Error("PRECONDITION_FAILED");
    execFileSync("npx", ["prisma", "migrate", "resolve", "--applied", AUDIT_RUN_MIGRATION], { stdio: "inherit" });
    console.log("RESOLVED");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("production-migration-reconciliation.ts")) {
  main().catch((error: unknown) => {
    const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "PRECONDITION_FAILED";
    console.error(code);
    process.exitCode = 1;
  });
}
