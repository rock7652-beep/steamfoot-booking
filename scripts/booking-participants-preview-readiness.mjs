import { assertBookingParticipantsPreviewEnvironment, isIsolatedConsultationDatabaseUrl, PARTICIPANT_LIFECYCLE_PREVIEW_BRANCH } from "./consultation-preview-scope.mjs";

/** @param {unknown} value */
export function assertBookingParticipantsPreviewSchema(value) {
  if (!value || typeof value !== "object") throw new Error("Booking participants Preview schema is not ready.");
  const row = /** @type {Record<string, unknown>} */ (value);
  if (row.tables_ready !== true || row.rls_enabled !== true || row.browser_access !== false || row.guards_ready !== true || row.personal_session_ready !== true || row.walk_in_guard_ready !== true || row.wallet_fk_ready !== true) {
    throw new Error("Booking participants Preview schema protections are not ready.");
  }
}

/** Read-only preflight: no migrations, fixtures, historical backfill or connection logs.
 * @param {Readonly<Record<string, string | undefined>>} env
 */
export function assertParticipantLifecycleSchema(value) {
  if (!value || typeof value !== "object" || value.lifecycle_ready !== true) {
    throw new Error("Participant lifecycle Preview requires the reviewed correction and reservation guards.");
  }
}

export async function verifyBookingParticipantsPreviewReadiness(env) {
  assertBookingParticipantsPreviewEnvironment(env);
  return verifyBookingParticipantsSchema(env);
}

export function assertBookingParticipantsProductionEnvironment(env) {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "production" || env.VERCEL_GIT_COMMIT_REF !== "main" ||
      env.VERCEL_GIT_REPO_OWNER !== "rock7652-beep" || env.VERCEL_GIT_REPO_SLUG !== "steamfoot-booking" ||
      env.WORKERS_CI_BRANCH || env.CF_PAGES_BRANCH || env.BOOKING_PARTICIPANTS_ENABLED !== "true") {
    throw new Error("Booking participants production requires the authorized main deployment.");
  }
  if (![env.DATABASE_URL, env.DIRECT_URL].every(value => typeof value === "string" &&
    value.includes("qijlnhtpbintanzpxkvf") && isIsolatedConsultationDatabaseUrl(value.replaceAll("qijlnhtpbintanzpxkvf", "ttworfzgwejdeolegkxl")))) {
    throw new Error("Booking participants production requires both verified production connections.");
  }
}

export async function verifyBookingParticipantsProductionReadiness(env) {
  assertBookingParticipantsProductionEnvironment(env);
  return verifyBookingParticipantsSchema(env);
}

async function verifyBookingParticipantsSchema(env) {
  const { PrismaClient } = await import("@prisma/client");
  const url = new URL(env.DATABASE_URL ?? "");
  for (const [key, value] of Object.entries({ connection_limit: "1", connect_timeout: "10", pool_timeout: "10", socket_timeout: "10" })) url.searchParams.set(key, value);
  if (url.hostname.endsWith(".pooler.supabase.com")) url.searchParams.set("pgbouncer", "true");
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
  try {
    const rows = await db.$queryRaw`
      SELECT
        (COALESCE(pg_get_functiondef(to_regprocedure('public.booking_participant_identity_guard()')), '') LIKE '%app.booking_participant_correction%'
          AND COALESCE(pg_get_functiondef(to_regprocedure('public.booking_participant_wallet_guard()')), '') LIKE '%RESERVED%'
          AND COALESCE(pg_get_functiondef(to_regprocedure('public.booking_participant_legacy_guard()')), '') LIKE '%ELSE ''PENDING'' END%') AS lifecycle_ready,
        (SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ('BookingParticipant','BookingParticipantGroup')) AS tables_ready,
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='BookingParticipant' AND column_name='walletSessionId')
          AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='BookingParticipant_wallet_guard' AND tgenabled='O') AS personal_session_ready,
        EXISTS(SELECT 1 FROM pg_proc WHERE proname='booking_participant_legacy_guard' AND prosrc LIKE '%app.booking_walk_in_group%') AS walk_in_guard_ready,
        EXISTS(SELECT 1 FROM pg_constraint WHERE conname='BookingParticipant_walletSessionId_fkey' AND contype='f' AND conrelid='public."BookingParticipant"'::regclass) AS wallet_fk_ready,
        (SELECT count(*)=2 AND bool_and(c.relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ('BookingParticipant','BookingParticipantGroup')) AS rls_enabled,
        EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ('BookingParticipant','BookingParticipantGroup')
          AND (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))) AS browser_access,
        (SELECT count(*)=4 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled='O'
          AND (c.relname,t.tgname) IN (
            ('BookingParticipant','BookingParticipant_identity'),
            ('BookingParticipantGroup','BookingParticipantGroup_identity'),
            ('Transaction','Transaction_participant_guard'),
            ('Booking','Booking_participant_guard'))) AS guards_ready`;
    assertBookingParticipantsPreviewSchema(rows[0]);
    if (env.VERCEL_GIT_COMMIT_REF === PARTICIPANT_LIFECYCLE_PREVIEW_BRANCH) assertParticipantLifecycleSchema(rows[0]);
    console.info("[booking-participants] schema_ready=true migrations_skipped=true");
  } catch {
    throw new Error("Booking participants Preview schema readiness failed; no migration or fixture was run.");
  } finally { await db.$disconnect(); }
}
