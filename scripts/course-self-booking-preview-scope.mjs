const PREVIEW_PROJECT = "ttworfzgwejdeolegkxl";
const PREVIEW_POOLER_HOSTS = new Set([
  "aws-0-ap-northeast-1.pooler.supabase.com",
  "aws-1-ap-northeast-1.pooler.supabase.com",
]);

/** @param {string} value @param {number} min @param {number} max */
function integerInRange(value, min, max) {
  return /^(0|[1-9]\d*)$/.test(value) && Number(value) >= min && Number(value) <= max;
}

// Only supported non-routing Prisma parameters are allowed. In particular,
// host/port/user/dbname/options/search_path cannot override the checked target.
/** @type {Record<string, (value: string) => boolean>} */
const PREVIEW_PARAMETERS = {
  schema: (value) => value === "public",
  sslmode: (value) => ["require", "verify-ca", "verify-full"].includes(value),
  sslaccept: (value) => value === "strict",
  pgbouncer: (value) => value === "true" || value === "false",
  connection_limit: (value) => integerInRange(value, 1, 100),
  connect_timeout: (value) => integerInRange(value, 0, 300),
  pool_timeout: (value) => integerInRange(value, 0, 300),
  socket_timeout: (value) => integerInRange(value, 0, 300),
  statement_cache_size: (value) => integerInRange(value, 0, 1000),
};

/** @param {string | undefined} value */
export function isSelfBookingPreviewDatabaseUrl(value) {
  if (!value || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)
      || url.pathname !== "/postgres" || url.hash) return false;
    const direct = url.hostname === `db.${PREVIEW_PROJECT}.supabase.co`
      && url.username === "postgres" && ["", "5432"].includes(url.port);
    const pooled = PREVIEW_POOLER_HOSTS.has(url.hostname)
      && url.username === `postgres.${PREVIEW_PROJECT}`
      && ["", "5432", "6543"].includes(url.port);
    if (!direct && !pooled) return false;
    const seen = new Set();
    for (const [key, parameter] of url.searchParams) {
      if (seen.has(key) || !Object.hasOwn(PREVIEW_PARAMETERS, key)
        || !PREVIEW_PARAMETERS[key](parameter)) return false;
      seen.add(key);
    }
    return true;
  } catch {
    return false;
  }
}

export const COURSE_SELF_BOOKING_PREVIEW_BRANCH = "codex/course-student-self-booking-switch";
export const COURSE_SELF_BOOKING_PREVIEW_STORE = "store-course-start-0918-a";

/** @param {Readonly<Record<string, string | undefined>>} env */
export function assertCourseSelfBookingPreviewEnvironment(env) {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" ||
      env.VERCEL_GIT_COMMIT_REF !== COURSE_SELF_BOOKING_PREVIEW_BRANCH ||
      env.VERCEL_GIT_REPO_OWNER !== "rock7652-beep" || env.VERCEL_GIT_REPO_SLUG !== "steamfoot-booking" ||
      Boolean(env.WORKERS_CI_BRANCH) || Boolean(env.CF_PAGES_BRANCH)) {
    throw new Error("Course self-booking Preview requires its exact Vercel Preview branch and repository.");
  }
  if (![env.DATABASE_URL, env.DIRECT_URL].every(isSelfBookingPreviewDatabaseUrl)) {
    throw new Error("Course self-booking Preview requires the existing isolated database for both connections.");
  }
}

/** @param {unknown} value */
export function assertCourseSelfBookingPreviewSchema(value) {
  if (!value || typeof value !== "object") throw new Error("Course self-booking Preview schema is not ready.");
  const row = /** @type {Record<string, unknown>} */ (value);
  if (row.columns_ready !== true || row.rls_enabled !== true || row.browser_access !== false || row.store_ready !== true) {
    throw new Error("Course self-booking Preview schema or test store is not ready.");
  }
}

/** Read only, after connection validation. Never runs migrations or logs a connection value.
 * @param {Readonly<Record<string, string | undefined>>} env
 */
export async function verifyCourseSelfBookingPreviewReadiness(env) {
  assertCourseSelfBookingPreviewEnvironment(env);
  const { PrismaClient } = await import("@prisma/client");
  const url = new URL(env.DATABASE_URL ?? "");
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("connect_timeout", "10");
  url.searchParams.set("pool_timeout", "10");
  url.searchParams.set("socket_timeout", "10");
  if (url.hostname.endsWith(".pooler.supabase.com")) url.searchParams.set("pgbouncer", "true");
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
  try {
    const rows = await db.$queryRaw`
      SELECT
        (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND table_name='CourseBookingRule' AND is_nullable='NO' AND
          ((column_name='selfBookingEnabled' AND data_type='boolean' AND column_default='true') OR
           (column_name='selfBookingRevision' AND data_type='integer' AND column_default='0'))) AS columns_ready,
        (SELECT relrowsecurity FROM pg_class WHERE oid='public."CourseBookingRule"'::regclass) AS rls_enabled,
        (has_table_privilege('anon','public."CourseBookingRule"','SELECT,INSERT,UPDATE,DELETE') OR
         has_table_privilege('authenticated','public."CourseBookingRule"','SELECT,INSERT,UPDATE,DELETE')) AS browser_access,
        EXISTS(SELECT 1 FROM public."Store" WHERE id=${COURSE_SELF_BOOKING_PREVIEW_STORE} AND slug='course-start-0918-a' AND "industryModule"::text='COURSE') AS store_ready`;
    assertCourseSelfBookingPreviewSchema(rows[0]);
    console.info("[course-self-booking-preview-preflight] isolated_database=true schema_ready=true test_store_ready=true notifications_blocked=true migrations_skipped=true");
  } catch {
    throw new Error("Course self-booking Preview schema readiness failed; no migration was run.");
  } finally { await db.$disconnect(); }
}
