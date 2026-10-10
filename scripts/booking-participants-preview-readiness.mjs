import { assertBookingParticipantsPreviewEnvironment } from "./consultation-preview-scope.mjs";

/** @param {unknown} value */
export function assertBookingParticipantsPreviewSchema(value) {
  if (!value || typeof value !== "object") throw new Error("Booking participants Preview schema is not ready.");
  const row = /** @type {Record<string, unknown>} */ (value);
  if (row.tables_ready !== true || row.rls_enabled !== true || row.browser_access !== false || row.guards_ready !== true) {
    throw new Error("Booking participants Preview schema protections are not ready.");
  }
}

/** Read-only preflight: no migrations, fixtures, historical backfill or connection logs.
 * @param {Readonly<Record<string, string | undefined>>} env
 */
export async function verifyBookingParticipantsPreviewReadiness(env) {
  assertBookingParticipantsPreviewEnvironment(env);
  const { PrismaClient } = await import("@prisma/client");
  const url = new URL(env.DATABASE_URL ?? "");
  for (const [key, value] of Object.entries({ connection_limit: "1", connect_timeout: "10", pool_timeout: "10", socket_timeout: "10" })) url.searchParams.set(key, value);
  if (url.hostname.endsWith(".pooler.supabase.com")) url.searchParams.set("pgbouncer", "true");
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
  try {
    const rows = await db.$queryRaw`
      SELECT
        (SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ('BookingParticipant','BookingParticipantGroup')) AS tables_ready,
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
    console.info("[booking-participants-preview] isolated_database=true schema_ready=true notifications_blocked=true migrations_skipped=true");
  } catch {
    throw new Error("Booking participants Preview schema readiness failed; no migration or fixture was run.");
  } finally { await db.$disconnect(); }
}
