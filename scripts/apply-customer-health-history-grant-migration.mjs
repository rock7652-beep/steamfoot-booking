import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const MIGRATION = "20260825133000_add_customer_health_history_grants";
const EXPECTED_PROJECT_REF = "qijlnhtpbintanzpxkvf";

function fail(code) {
  console.error(`health-grant-migration: aborted code=${code}`);
  process.exit(1);
}

function projectRef(value) {
  try {
    const url = new URL(value);
    const match = url.username.match(/^postgres\.([a-z0-9]+)$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

if (process.env.CONFIRMATION !== "APPLY_CUSTOMER_HEALTH_HISTORY_GRANT_MIGRATION") {
  fail("confirmation_rejected");
}
if (projectRef(process.env.DIRECT_URL) !== EXPECTED_PROJECT_REF) {
  fail("production_connection_rejected");
}

const env = {
  ...process.env,
  DATABASE_URL: process.env.DIRECT_URL,
  DIRECT_URL: process.env.DIRECT_URL,
};

let status = "";
try {
  status = execFileSync("npx", ["prisma", "migrate", "status"], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  status = `${error.stdout ?? ""}${error.stderr ?? ""}`;
}

const pending = status
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => /^\d{14}_[A-Za-z0-9_-]+$/.test(line));
if (pending.length !== 1 || pending[0] !== MIGRATION) {
  fail("pending_migration_allowlist_rejected");
}

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
try {
  const before = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public."CustomerHealthHistoryGrant"') AS table_name`,
  );
  if (before[0]?.table_name !== null) fail("preexisting_table_rejected");
} finally {
  await prisma.$disconnect();
}

console.log("health-grant-migration: guarded_deploy_started");
try {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env,
    encoding: "utf8",
    stdio: "inherit",
  });
} catch {
  fail("deploy_failed");
}

const verify = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
try {
  const [table, ledger, rls] = await Promise.all([
    verify.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'CustomerHealthHistoryGrant'`,
    ),
    verify.$queryRawUnsafe(
      `SELECT finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1`,
      MIGRATION,
    ),
    verify.$queryRawUnsafe(
      `SELECT relrowsecurity FROM pg_class WHERE oid = 'public."CustomerHealthHistoryGrant"'::regclass`,
    ),
  ]);
  if (
    table[0]?.count !== 8 ||
    !ledger[0]?.finished_at ||
    ledger[0]?.rolled_back_at ||
    rls[0]?.relrowsecurity !== true
  ) {
    fail("final_schema_verification_failed");
  }
  console.log("health-grant-migration: final_schema_verified");
} finally {
  await verify.$disconnect();
}
