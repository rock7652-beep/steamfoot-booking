import { execFileSync } from "node:child_process";
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
  columns: string[];
  indexes: string[];
  constraints: string[];
  rlsEnabled: boolean;
  policyCount: number;
  rowCount: number;
};

const REQUIRED_COLUMNS = [
  "id", "storeId", "requestedByUserId", "createdAt", "completedAt", "status",
  "appValidated", "pageTokenMatches", "callbackMatches", "configuredFields",
  "missingFields", "pageAttached", "callsSafeSummary", "errorCode",
];
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
    REQUIRED_COLUMNS.every((name) => snapshot.columns.includes(name)) &&
    REQUIRED_INDEXES.every((name) => snapshot.indexes.includes(name)) &&
    REQUIRED_CONSTRAINTS.every((name) => snapshot.constraints.includes(name))
  );
}

export function safeRlsState(snapshot: Snapshot) {
  return hasSchemaContract(snapshot) && snapshot.rlsEnabled && snapshot.policyCount === 0;
}

function requireProduction() {
  if (process.env.VERCEL_ENV !== "production") throw new Error("PRODUCTION_ENV_REQUIRED");
  if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) throw new Error("PRECONDITION_FAILED");
}

async function snapshot(prisma: PrismaClient): Promise<Snapshot> {
  const [columns, indexes, constraints, rls, policies, rowCount] = await Promise.all([
    prisma.$queryRaw<Array<{ column_name: string }>>`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'MessengerAuditRun'`,
    prisma.$queryRaw<Array<{ indexname: string }>>`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'MessengerAuditRun'`,
    prisma.$queryRaw<Array<{ conname: string }>>`SELECT conname FROM pg_constraint WHERE conrelid = 'public."MessengerAuditRun"'::regclass`,
    prisma.$queryRaw<Array<{ relrowsecurity: boolean }>>`SELECT relrowsecurity FROM pg_class WHERE oid = 'public."MessengerAuditRun"'::regclass`,
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM pg_policies WHERE schemaname = 'public' AND tablename = 'MessengerAuditRun'`,
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM "MessengerAuditRun"`,
  ]);
  return {
    columns: columns.map(({ column_name }) => column_name),
    indexes: indexes.map(({ indexname }) => indexname),
    constraints: constraints.map(({ conname }) => conname),
    rlsEnabled: rls[0]?.relrowsecurity === true,
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
    if (stage === "inspect") return console.log(before.rlsEnabled ? "ALREADY_SECURED" : "RLS_REPAIR_READY");
    if (stage === "repair") {
      if (before.rlsEnabled) return console.log("ALREADY_SECURED");
      if (!apply || confirmation !== RLS_CONFIRMATION) throw new Error("CONFIRMATION_REQUIRED");
      await prisma.$executeRaw`ALTER TABLE "MessengerAuditRun" ENABLE ROW LEVEL SECURITY`;
      const after = await snapshot(prisma);
      if (!safeRlsState(after) || after.rowCount !== before.rowCount) throw new Error("PRECONDITION_FAILED");
      return console.log("RLS_REPAIRED");
    }
    if (!safeRlsState(before) || !apply || confirmation !== RESOLVE_CONFIRMATION) throw new Error("CONFIRMATION_REQUIRED");
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
