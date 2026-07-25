/**
 * Read-only Digital Butler database preflight.
 *
 * This script performs SELECT queries only. It never runs migrate deploy or
 * changes feature entitlements, activation flags, flows, conversations, or leads.
 */
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const REQUIRED_MIGRATIONS = [
  "20260723190000_add_digital_butler_core_model",
  "20260725150000_add_digital_butler_lead_tracking",
] as const;
const REQUIRED_TABLES = [
  "StoreDigitalButlerFlow",
  "DigitalButlerFlowVersion",
  "DigitalButlerConversation",
  "DigitalButlerLead",
  "DigitalButlerLeadActivity",
] as const;

async function main() {
  const migrations = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>`
    SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    WHERE migration_name IN (${Prisma.join(REQUIRED_MIGRATIONS)})
  `;
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (${Prisma.join(REQUIRED_TABLES)})
  `;

  const applied = new Set(
    migrations
      .filter((item) => item.finished_at && !item.rolled_back_at)
      .map((item) => item.migration_name),
  );
  const existing = new Set(tables.map((item) => item.table_name));
  const missingMigrations = REQUIRED_MIGRATIONS.filter((item) => !applied.has(item));
  const missingTables = REQUIRED_TABLES.filter((item) => !existing.has(item));

  console.log(JSON.stringify({
    ready: missingMigrations.length === 0 && missingTables.length === 0,
    missingMigrations,
    missingTables,
  }, null, 2));
  if (missingMigrations.length || missingTables.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Preflight failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
