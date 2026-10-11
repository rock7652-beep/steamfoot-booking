import { assertModuleRosterPreviewEnvironment, assertReviewedReleaseEnvironment, isIsolatedConsultationDatabaseUrl, UNREGISTERED_PARTICIPANT_PREVIEW_BRANCH } from "./consultation-preview-scope.mjs";
import { fileURLToPath } from "node:url";

export function assertUnregisteredParticipantEnvironment(env) {
  if (env.VERCEL_ENV === "production") {
    if (assertReviewedReleaseEnvironment(env) !== "production" ||
        ![env.DATABASE_URL, env.DIRECT_URL].every(value => typeof value === "string" &&
          value.includes("qijlnhtpbintanzpxkvf") && isIsolatedConsultationDatabaseUrl(value.replaceAll("qijlnhtpbintanzpxkvf", "ttworfzgwejdeolegkxl")))) {
      throw new Error("Unregistered participant production requires verified main and both production connections.");
    }
  } else {
    if (env.VERCEL_GIT_COMMIT_REF !== UNREGISTERED_PARTICIPANT_PREVIEW_BRANCH) throw new Error("Unregistered participant Preview requires its exact branch.");
    assertModuleRosterPreviewEnvironment(env);
  }
}
export function assertUnregisteredParticipantSchema(row) {
  if (!row || row.columns_ready !== true || row.trace_ready !== true || row.guard_ready !== true || row.browser_callable !== false) {
    throw new Error("Unregistered participant payment schema is not ready; no migration was run.");
  }
}
/** Read only, required even with the feature flag disabled: generated Transaction reads include the trace column. */
export async function verifyUnregisteredParticipantSchema(env) {
  assertUnregisteredParticipantEnvironment(env);
  const { PrismaClient } = await import("@prisma/client");
  const url = new URL(env.DATABASE_URL);
  for (const [key, value] of Object.entries({ connection_limit: "1", connect_timeout: "10", pool_timeout: "10", socket_timeout: "10" })) url.searchParams.set(key, value);
  if (url.hostname.endsWith(".pooler.supabase.com")) url.searchParams.set("pgbouncer", "true");
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
  try {
    const [row] = await db.$queryRaw`
      SELECT
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Transaction' AND column_name='customerId' AND is_nullable='YES')
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Transaction' AND column_name='unregisteredParticipantId') AS columns_ready,
        EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Transaction_unregistered_participant_fkey' AND conrelid='public."Transaction"'::regclass AND contype='f') AS trace_ready,
        EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='Transaction_unregistered_receipt_guard' AND tgrelid='public."Transaction"'::regclass AND tgenabled='O' AND tgdeferrable AND tginitdeferred)
        AND EXISTS (SELECT 1 FROM pg_proc WHERE proname='booking_participant_identity_guard' AND prosrc LIKE '%IF payment_customer IS DISTINCT FROM NEW."customerId"%')
        AND EXISTS (SELECT 1 FROM pg_proc WHERE proname='booking_participant_legacy_guard' AND prosrc LIKE '%p."customerId" IS NOT DISTINCT FROM NEW."customerId"%') AS guard_ready,
        EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='booking_unregistered_receipt_guard'
          AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) AS browser_callable`;
    assertUnregisteredParticipantSchema(row);
    console.info("[unregistered-participant-payment] schema_ready=true migrations_skipped=true");
  } finally { await db.$disconnect(); }
}

// A separate build preflight keeps the migration target gate independent.
// All production builds need the new scalar column, even with fee collection disabled.
if (process.argv[1] === fileURLToPath(import.meta.url) && process.env.VERCEL_ENV === "production") {
  await verifyUnregisteredParticipantSchema(process.env);
}
