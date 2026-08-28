import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const MIGRATION = "20260828141500_add_spa_treatments_skills_availability";
const ALLOWED_PROJECT_REFS = new Set([
  "qijlnhtpbintanzpxkvf",
  "ttworfzgwejdeolegkxl",
]);
const EXPECTED_CONFIRMATION = "APPLY_SPA_DEMO_SCHEMA_ROLLOUT";
const SPA_TABLES = [
  "ProfessionalSkill",
  "Treatment",
  "TreatmentSkill",
  "StaffSkill",
  "StaffWeeklyAvailability",
  "StaffAvailabilityException",
];

function fail(code) {
  console.error(`spa-demo-rollout: aborted code=${code}`);
  process.exit(1);
}

function projectRef(value) {
  try {
    const url = new URL(value);
    const poolerRef = url.username.match(/^postgres\.([a-z0-9]+)$/)?.[1];
    if (poolerRef) return poolerRef;
    if (url.username !== "postgres") return null;
    return url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function run(command, args) {
  execFileSync(command, args, {
    env: { ...process.env, DATABASE_URL: process.env.DIRECT_URL, DIRECT_URL: process.env.DIRECT_URL },
    stdio: "inherit",
  });
}

if (process.env.CONFIRMATION !== EXPECTED_CONFIRMATION) fail("confirmation_rejected");
const actualProjectRef = projectRef(process.env.DIRECT_URL);
if (!actualProjectRef || !ALLOWED_PROJECT_REFS.has(actualProjectRef)) {
  console.error("spa-demo-rollout: connection-diagnostic", { directUrlPresent: Boolean(process.env.DIRECT_URL), actualProjectRef });
  fail("production_connection_rejected");
}

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

try {
  const [identity, tables, ledger] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT id, slug, "isDemo" FROM "Store" WHERE id = 'demo-store' OR slug = 'demo' ORDER BY id`),
    prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name`, SPA_TABLES),
    prisma.$queryRawUnsafe(`SELECT finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1`, MIGRATION),
  ]);
  if (identity.length !== 1 || identity[0].id !== "demo-store" || identity[0].slug !== "demo" || identity[0].isDemo !== true) {
    console.error("spa-demo-rollout: identity-diagnostic", identity.map((row) => ({ id: row.id, slug: row.slug, isDemo: row.isDemo })));
    fail("demo_store_identity_rejected");
  }
  if (![0, SPA_TABLES.length].includes(tables.length)) fail("partial_schema_rejected");
  if (ledger.length > 1 || ledger[0]?.rolled_back_at) fail("migration_ledger_rejected");

  if (tables.length === 0) {
    if (ledger.length) fail("ledger_schema_mismatch_rejected");
    console.log("spa-demo-rollout: applying additive schema");
    run("npx", ["prisma", "db", "execute", "--schema", "prisma/schema.prisma", "--file", `prisma/migrations/${MIGRATION}/migration.sql`]);
  }

  const [fingerprint, bookingColumns, rls] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT table_name, COUNT(*)::int AS columns FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[]) GROUP BY table_name ORDER BY table_name`, SPA_TABLES),
    prisma.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Booking' AND column_name = ANY($1::text[]) ORDER BY column_name`, ["treatmentId", "treatmentNameSnapshot", "treatmentVariantSnapshot", "treatmentPriceSnapshot", "treatmentServiceMinutesSnapshot", "treatmentBufferMinutesSnapshot"]),
    prisma.$queryRawUnsafe(`SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1::text[]) ORDER BY relname`, SPA_TABLES),
  ]);
  if (fingerprint.length !== SPA_TABLES.length || bookingColumns.length !== 6 || rls.length !== SPA_TABLES.length || rls.some((row) => row.relrowsecurity !== true)) {
    fail("schema_fingerprint_rejected");
  }

  if (!ledger.length) {
    run("npx", ["prisma", "migrate", "resolve", "--applied", MIGRATION]);
  }
} finally {
  await prisma.$disconnect();
}

console.log("spa-demo-rollout: applying allowlisted demo seed");
run("npx", ["tsx", "prisma/seed-spa-demo-store.ts", "--apply"]);

const verify = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
try {
  const [formalRows, formalBookings, demoCounts, ledger] = await Promise.all([
    verify.$queryRawUnsafe(`
      SELECT SUM(count)::int AS count FROM (
        SELECT COUNT(*) AS count FROM "ProfessionalSkill" WHERE "storeId" <> 'demo-store'
        UNION ALL SELECT COUNT(*) FROM "Treatment" WHERE "storeId" <> 'demo-store'
        UNION ALL SELECT COUNT(*) FROM "TreatmentSkill" WHERE "storeId" <> 'demo-store'
        UNION ALL SELECT COUNT(*) FROM "StaffSkill" WHERE "storeId" <> 'demo-store'
        UNION ALL SELECT COUNT(*) FROM "StaffWeeklyAvailability" WHERE "storeId" <> 'demo-store'
        UNION ALL SELECT COUNT(*) FROM "StaffAvailabilityException" WHERE "storeId" <> 'demo-store'
      ) counts
    `),
    verify.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "Booking" WHERE "storeId" <> 'demo-store' AND ("treatmentId" IS NOT NULL OR "treatmentNameSnapshot" IS NOT NULL OR "treatmentVariantSnapshot" IS NOT NULL OR "treatmentPriceSnapshot" IS NOT NULL OR "treatmentServiceMinutesSnapshot" IS NOT NULL OR "treatmentBufferMinutesSnapshot" IS NOT NULL)`),
    verify.$queryRawUnsafe(`SELECT (SELECT COUNT(*) FROM "ProfessionalSkill" WHERE "storeId" = 'demo-store')::int AS skills, (SELECT COUNT(*) FROM "Treatment" WHERE "storeId" = 'demo-store')::int AS treatments, (SELECT COUNT(*) FROM "StaffSkill" WHERE "storeId" = 'demo-store')::int AS staff_skills, (SELECT COUNT(*) FROM "StaffWeeklyAvailability" WHERE "storeId" = 'demo-store')::int AS weekly_ranges`),
    verify.$queryRawUnsafe(`SELECT finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1`, MIGRATION),
  ]);
  if (formalRows[0]?.count !== 0 || formalBookings[0]?.count !== 0) fail("formal_store_isolation_rejected");
  if (demoCounts[0]?.skills !== 4 || demoCounts[0]?.treatments !== 5 || demoCounts[0]?.staff_skills < 9 || demoCounts[0]?.weekly_ranges < 15) fail("demo_seed_verification_rejected");
  if (ledger.length !== 1 || !ledger[0].finished_at || ledger[0].rolled_back_at) fail("migration_ledger_verification_rejected");
  console.log(`spa-demo-rollout: verified skills=${demoCounts[0].skills} treatments=${demoCounts[0].treatments} staffSkills=${demoCounts[0].staff_skills} weeklyRanges=${demoCounts[0].weekly_ranges} formalRows=0 formalBookingSnapshots=0`);
} finally {
  await verify.$disconnect();
}
