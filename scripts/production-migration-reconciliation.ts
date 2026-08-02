import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

export const AUDIT_MIGRATION = "20260729090000_add_messenger_audit_runs";
export const PAYMENT_MIGRATION = "20260801090000_add_transaction_payment_splits";
export const RLS_CONFIRMATION = "REPAIR_MESSENGER_AUDIT_RUN_RLS";
export const RESOLVE_CONFIRMATION = "RESOLVE_MESSENGER_AUDIT_RUN_MIGRATION";
export type Stage = "inspect" | "repair-rls" | "resolve-audit-run";
type Parsed = { stage: Stage; apply: boolean; confirmation?: string };

const expectedColumns = {
  id: ["text", "text", false, null], storeId: ["text", "text", false, null], requestedByUserId: ["text", "text", false, null],
  createdAt: ["timestamp without time zone", "timestamp", false, "CURRENT_TIMESTAMP"], completedAt: ["timestamp without time zone", "timestamp", true, null],
  status: ["USER-DEFINED", "MessengerAuditStatus", false, "'RUNNING'::\"MessengerAuditStatus\""],
  appValidated: ["boolean", "bool", true, null], pageTokenMatches: ["boolean", "bool", true, null], callbackMatches: ["boolean", "bool", true, null],
  configuredFields: ["ARRAY", "_text", false, "ARRAY[]::TEXT[]"], missingFields: ["ARRAY", "_text", false, "ARRAY[]::TEXT[]"],
  pageAttached: ["boolean", "bool", true, null], callsSafeSummary: ["jsonb", "jsonb", true, null], errorCode: ["text", "text", true, null],
} as const;
const expectedIndexes = {
  MessengerAuditRun_pkey: [true, ["id"]],
  MessengerAuditRun_storeId_createdAt_idx: [false, ["storeId", "createdAt"]],
  MessengerAuditRun_requestedByUserId_createdAt_idx: [false, ["requestedByUserId", "createdAt"]],
} as const;
const expectedForeignKeys = {
  MessengerAuditRun_storeId_fkey: ["storeId", "public", "Store", "id", "CASCADE", "CASCADE"],
  MessengerAuditRun_requestedByUserId_fkey: ["requestedByUserId", "public", "User", "id", "CASCADE", "RESTRICT"],
} as const;

export function parseArgs(args: string[]): Parsed {
  const stages = args.filter((arg) => arg.startsWith("--stage="));
  if (stages.length !== 1 || new Set(stages).size !== 1 || args.some((arg) => arg !== "--apply" && !arg.startsWith("--stage=") && !arg.startsWith("--confirm=")) || args.filter((arg) => arg === "--apply").length > 1 || args.filter((arg) => arg.startsWith("--confirm=")).length > 1) throw new Error("INVALID_ARGUMENTS");
  const stage = stages[0].slice(8) as Stage;
  if (!(["inspect", "repair-rls", "resolve-audit-run"] as string[]).includes(stage)) throw new Error("INVALID_ARGUMENTS");
  const apply = args.includes("--apply");
  const confirmation = args.find((arg) => arg.startsWith("--confirm="))?.slice(10);
  if (stage === "inspect" ? apply || confirmation : !apply || confirmation !== (stage === "repair-rls" ? RLS_CONFIRMATION : RESOLVE_CONFIRMATION)) throw new Error("INVALID_ARGUMENTS");
  return { stage, apply, confirmation };
}

export function verifiedDirectUrl(env: { VERCEL_ENV?: string; DIRECT_URL?: string }) {
  if (env.VERCEL_ENV !== "production" || !env.DIRECT_URL) throw new Error("PRODUCTION_DIRECT_URL_REQUIRED");
  const value = new URL(env.DIRECT_URL);
  if (!(["5432", "6543"].includes(value.port)) || !/^postgres\.[a-z0-9]+$/.test(value.username)) throw new Error("PRODUCTION_DIRECT_URL_REQUIRED");
  return value.toString();
}

export function prismaCliEnv(directUrl: string) { return { ...process.env, DATABASE_URL: directUrl, DIRECT_URL: directUrl }; }

type Column = { name: string; dataType: string; udt: string; nullable: boolean; defaultValue: string | null };
type Index = { name: string; unique: boolean; columns: string[] };
type ForeignKey = { name: string; column: string; schema: string; table: string; targetColumn: string; onUpdate: string; onDelete: string };
export type SchemaSnapshot = { columns: Column[]; indexes: Index[]; foreignKeys: ForeignKey[]; rlsEnabled: boolean; rlsForced: boolean; policyCount: number; rowCount: number };
type RawMetadata = { columns: Array<{ column_name:string; data_type:string; udt_name:string; is_nullable:string; column_default:string|null }>; indexes: Array<{ index_name:string; is_unique:boolean; columns:string[] }>; foreignKeys: Array<{ constraint_name:string; local_column:string; target_schema:string; target_table:string; target_column:string; on_update:string; on_delete:string }>; rls: Array<{ enabled:boolean; forced:boolean }>; policies: Array<{ count:bigint }>; rows: Array<{ count:bigint }> };
export function normalizeMetadata(raw: RawMetadata): SchemaSnapshot { return { columns: raw.columns.map(c=>({name:c.column_name,dataType:c.data_type,udt:c.udt_name,nullable:c.is_nullable==='YES',defaultValue:c.column_default})).sort((a,b)=>a.name.localeCompare(b.name)), indexes:raw.indexes.map(i=>({name:i.index_name,unique:i.is_unique,columns:i.columns})).sort((a,b)=>a.name.localeCompare(b.name)), foreignKeys:raw.foreignKeys.map(f=>({name:f.constraint_name,column:f.local_column,schema:f.target_schema,table:f.target_table,targetColumn:f.target_column,onUpdate:f.on_update,onDelete:f.on_delete})).sort((a,b)=>a.name.localeCompare(b.name)),rlsEnabled:raw.rls[0]?.enabled===true,rlsForced:raw.rls[0]?.forced===true,policyCount:Number(raw.policies[0]?.count??-1),rowCount:Number(raw.rows[0]?.count??-1) }; }
export function hasExactSchema(snapshot: SchemaSnapshot) {
  return Object.entries(expectedColumns).every(([name, [dataType, udt, nullable, defaultValue]]) => snapshot.columns.some((c) => c.name === name && c.dataType === dataType && c.udt === udt && c.nullable === nullable && c.defaultValue === defaultValue)) && snapshot.columns.length === Object.keys(expectedColumns).length && Object.entries(expectedIndexes).every(([name, [unique, columns]]) => snapshot.indexes.some((i) => i.name === name && i.unique === unique && JSON.stringify(i.columns) === JSON.stringify(columns))) && snapshot.indexes.length === Object.keys(expectedIndexes).length && Object.entries(expectedForeignKeys).every(([name, [column, schema, table, targetColumn, onUpdate, onDelete]]) => snapshot.foreignKeys.some((f) => f.name === name && f.column === column && f.schema === schema && f.table === table && f.targetColumn === targetColumn && f.onUpdate === onUpdate && f.onDelete === onDelete)) && snapshot.foreignKeys.length === Object.keys(expectedForeignKeys).length;
}
export function safeRls(snapshot: SchemaSnapshot) { return hasExactSchema(snapshot) && snapshot.rlsEnabled && snapshot.rlsForced && snapshot.policyCount === 0; }
export function repairVerified(before: SchemaSnapshot, after: SchemaSnapshot) { return safeRls(after) && after.rowCount === before.rowCount; }
export function repositoryChecksum() { return createHash("sha256").update(readFileSync(resolve("prisma/migrations", AUDIT_MIGRATION, "migration.sql"))).digest("hex"); }
export function hasResolveLedger(records: Array<{ checksum: string; finishedAt: Date | null; rolledBackAt: Date | null; steps: number }>, status: string) { const ids = status.match(/20\d{12}_[a-z0-9_]+/g) ?? []; return records.length === 1 && records[0].checksum === repositoryChecksum() && records[0].finishedAt === null && records[0].rolledBackAt === null && records[0].steps === 0 && JSON.stringify(ids) === JSON.stringify([AUDIT_MIGRATION, PAYMENT_MIGRATION]) && /failed/i.test(status) && /pending|not yet been applied/i.test(status); }

async function loadSnapshot(prisma: PrismaClient): Promise<SchemaSnapshot> {
  const [columns,indexes,foreignKeys,rls,policies,rows] = await Promise.all([
    prisma.$queryRaw<RawMetadata['columns']>`SELECT column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='MessengerAuditRun'`,
    prisma.$queryRaw<RawMetadata['indexes']>`SELECT i.relname AS index_name, ix.indisunique AS is_unique, array_agg(a.attname ORDER BY key.ordinality) AS columns FROM pg_index ix JOIN pg_class t ON t.oid=ix.indrelid JOIN pg_class i ON i.oid=ix.indexrelid JOIN unnest(ix.indkey) WITH ORDINALITY key(attnum,ordinality) ON true JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=key.attnum WHERE t.oid='public."MessengerAuditRun"'::regclass GROUP BY i.relname,ix.indisunique`,
    prisma.$queryRaw<RawMetadata['foreignKeys']>`SELECT c.conname AS constraint_name,la.attname AS local_column,ns.nspname AS target_schema,rt.relname AS target_table,ra.attname AS target_column,CASE c.confupdtype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT' ELSE 'OTHER' END AS on_update,CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT' ELSE 'OTHER' END AS on_delete FROM pg_constraint c JOIN pg_class lt ON lt.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=(SELECT relnamespace FROM pg_class WHERE oid=c.confrelid) JOIN pg_class rt ON rt.oid=c.confrelid JOIN unnest(c.conkey,c.confkey) WITH ORDINALITY k(local_attnum,target_attnum,ordinality) ON true JOIN pg_attribute la ON la.attrelid=lt.oid AND la.attnum=k.local_attnum JOIN pg_attribute ra ON ra.attrelid=rt.oid AND ra.attnum=k.target_attnum WHERE c.contype='f' AND c.conrelid='public."MessengerAuditRun"'::regclass`,
    prisma.$queryRaw<RawMetadata['rls']>`SELECT relrowsecurity AS enabled,relforcerowsecurity AS forced FROM pg_class WHERE oid='public."MessengerAuditRun"'::regclass`, prisma.$queryRaw<RawMetadata['policies']>`SELECT count(*)::bigint AS count FROM pg_policies WHERE schemaname='public' AND tablename='MessengerAuditRun'`, prisma.$queryRaw<RawMetadata['rows']>`SELECT count(*)::bigint AS count FROM "MessengerAuditRun"`,
  ]); return normalizeMetadata({columns,indexes,foreignKeys,rls,policies,rows});
}
async function main() {
  const input = parseArgs(process.argv.slice(2)); const directUrl = verifiedDirectUrl({ VERCEL_ENV: process.env.VERCEL_ENV, DIRECT_URL: process.env.DIRECT_URL }); const prisma = new PrismaClient({ datasources: { db: { url: directUrl } } });
  try {
    const before = await loadSnapshot(prisma);
    if (!hasExactSchema(before)) throw new Error("PRECONDITION_FAILED");
    if (input.stage === "inspect") return console.log(before.rlsEnabled&&before.rlsForced?"SCHEMA_CONTRACT_OK":"RLS_REPAIR_READY");
    if (input.stage === "repair-rls") { if (before.policyCount!==0) throw new Error("PRECONDITION_FAILED"); await prisma.$executeRaw`ALTER TABLE "MessengerAuditRun" ENABLE ROW LEVEL SECURITY`; await prisma.$executeRaw`ALTER TABLE "MessengerAuditRun" FORCE ROW LEVEL SECURITY`; const after = await loadSnapshot(prisma); if (!repairVerified(before, after)) throw new Error("RLS_POSTCONDITION_FAILED"); return console.log("RLS_REPAIRED"); }
    if (!safeRls(before)) throw new Error("PRECONDITION_FAILED");
    let status = ""; try { status = execFileSync("npx", ["prisma", "migrate", "status"], { encoding: "utf8", env: prismaCliEnv(directUrl) }); } catch (error) { const e = error as { stdout?: string; stderr?: string }; status = `${e.stdout ?? ""}${e.stderr ?? ""}`; }
    const ledger = await prisma.$queryRaw<Array<{ checksum: string; finishedAt: Date | null; rolledBackAt: Date | null; steps: number }>>`SELECT checksum, finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt", applied_steps_count AS steps FROM "_prisma_migrations" WHERE migration_name = ${AUDIT_MIGRATION}`;
    if (!hasResolveLedger(ledger, status)) throw new Error("PRECONDITION_FAILED");
    execFileSync("npx", ["prisma", "migrate", "resolve", "--applied", AUDIT_MIGRATION], { stdio: "inherit", env: prismaCliEnv(directUrl) }); console.log("RESOLVED");
  } finally { await prisma.$disconnect(); }
}
if (process.argv[1]?.endsWith("production-migration-reconciliation.ts")) main().catch(() => { console.error("PRECONDITION_FAILED"); process.exitCode = 1; });
