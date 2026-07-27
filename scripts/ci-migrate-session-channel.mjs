import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const EXPECTED_MIGRATIONS = [
  "20260727090000_channel_neutral_digital_butler",
  "20260727100000_add_session_balance_notifications",
];
const LEGACY_MIGRATION = "20260723183000_add_reminder_line_route";
const PROD_REF = "qijlnhtpbintanzpxkvf";
const STAGING_REF = "ttworfzgwejdeolegkxl";
const log = (message) => console.log(`[ci-migrate] ${message}`);

function projectRef(url) {
  if (!url) return null;
  return url.match(/:\/\/postgres\.([a-z0-9]+):/)?.[1]
    ?? url.match(/@db\.([a-z0-9]+)\.supabase\.co/)?.[1]
    ?? null;
}

function migrationStatus() {
  try {
    return execSync("npx prisma migrate status", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
}

function pendingMigrations(statusText) {
  const pending = [];
  let collecting = false;
  for (const raw of statusText.split("\n")) {
    const line = raw.trim();
    if (/have not yet been applied/i.test(line)) {
      collecting = true;
      continue;
    }
    if (/^(To apply|Database schema)/i.test(line)) collecting = false;
    if (collecting && /^\d{6,}_/.test(line)) pending.push(line);
  }
  return pending;
}

async function reconcileLegacyMigration() {
  const prisma = new PrismaClient();
  try {
    const [failed] = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1
        FROM "_prisma_migrations"
        WHERE "migration_name" = ${LEGACY_MIGRATION}
          AND "finished_at" IS NULL
          AND "rolled_back_at" IS NULL
      ) AS "exists"
    `;
    if (!failed?.exists) return;

    const [objects] = await prisma.$queryRaw`
      SELECT
        EXISTS (
          SELECT 1 FROM "pg_type" WHERE "typname" = 'ReminderLineRoute'
        ) AS "typeExists",
        EXISTS (
          SELECT 1
          FROM "information_schema"."columns"
          WHERE "table_schema" = 'public'
            AND "table_name" = 'MessageLog'
            AND "column_name" = 'lineRoute'
            AND "is_nullable" = 'YES'
        ) AS "columnExists",
        TO_REGCLASS('public."MessageLog_lineRoute_idx"') IS NOT NULL AS "indexExists"
    `;
    if (!objects?.typeExists || !objects?.columnExists || !objects?.indexExists) {
      throw new Error(
        `Cannot reconcile ${LEGACY_MIGRATION}: expected enum, nullable column, and index are not all present`,
      );
    }

    execSync(`npx prisma migrate resolve --applied ${LEGACY_MIGRATION}`, {
      stdio: "inherit",
    });
    log(`${LEGACY_MIGRATION} reconciled after catalog verification`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const databaseRef = projectRef(process.env.DATABASE_URL);
  const directRef = projectRef(process.env.DIRECT_URL);
  log(`VERCEL_ENV=${process.env.VERCEL_ENV ?? "(none)"} DATABASE_URL.ref=${databaseRef ?? "?"} DIRECT_URL.ref=${directRef ?? "?"}`);

  if (process.env.VERCEL_ENV !== "production") {
    log("skip: not a production build");
    return;
  }
  if (databaseRef === STAGING_REF || directRef === STAGING_REF) {
    log("skip: staging database detected");
    return;
  }
  if (databaseRef !== PROD_REF || directRef !== PROD_REF) {
    log("skip: database is not the approved production project");
    return;
  }

  await reconcileLegacyMigration();
  const status = migrationStatus();
  if (/Database schema is up to date/i.test(status)) {
    log("database is already up to date");
    return;
  }
  const pending = pendingMigrations(status);
  log(`pending: [${pending.join(", ")}]`);
  if (JSON.stringify(pending) !== JSON.stringify(EXPECTED_MIGRATIONS)) {
    throw new Error(
      `Expected exactly ${EXPECTED_MIGRATIONS.join(", ")}, received ${pending.join(", ")}`,
    );
  }

  execSync("npx prisma migrate deploy", { stdio: "inherit" });
  log("approved production migrations applied");
}

await main();
