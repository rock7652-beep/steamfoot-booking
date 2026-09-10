import { PrismaClient } from "@prisma/client";

const TEST_PROJECT_REF = "ttworfzgwejdeolegkxl";

function getProjectRef(connectionUrl: string | undefined) {
  if (!connectionUrl) return null;
  try {
    return new URL(connectionUrl).username.split(".")[1] ?? null;
  } catch {
    return null;
  }
}

async function main() {
  if (getProjectRef(process.env.DIRECT_URL) !== TEST_PROJECT_REF) {
    throw new Error("Refusing to inspect a database other than the SPA test project.");
  }

  // Use the migration/direct connection for this read-only verifier. Application
  // runtime must be verified separately through DATABASE_URL.
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
  try {
    const [installations, spaRows, legacyForeignKeys] = await Promise.all([
      prisma.storeModuleInstallation.groupBy({ by: ["module", "status"], _count: true }),
      prisma.$queryRaw<Array<{ table_name: string; rows: bigint }>>`
        SELECT table_name, (xpath('/row/count/text()', query_to_xml(format('SELECT count(*) FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint AS rows
        FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name LIKE 'Spa%'
        ORDER BY table_name
      `,
      prisma.$queryRaw<Array<{ table_name: string; target_table: string }>>`
        SELECT tc.table_name, ccu.table_name AS target_table
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.constraint_schema = tc.constraint_schema
        WHERE tc.constraint_schema = current_schema()
          AND tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name LIKE 'Spa%'
          AND ccu.table_name IN ('Booking', 'Transaction', 'Treatment')
        ORDER BY tc.table_name
      `,
    ]);

    console.log(JSON.stringify({
      targetProjectRef: TEST_PROJECT_REF,
      installations,
      spaRows: spaRows.map((row) => ({ ...row, rows: Number(row.rows) })),
      legacyForeignKeys,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
