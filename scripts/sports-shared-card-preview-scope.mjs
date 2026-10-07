import { isIsolatedCourseConnection } from "./course-preview-scope.mjs";

export const SPORTS_SHARED_CARD_PREVIEW_BRANCH = "feat/sports-shared-card-controls-20261007";

/**
 * Existing mocked Vitest tests import the migration runner and business clients.
 * This exception is unavailable on deployed Vercel, even if test flags are set.
 * @param {Readonly<Record<string, string | undefined>>} env
 */
export function isSportsSharedCardMockedUnitTest(env) {
  return env.NODE_ENV === "test" && env.VITEST === "true" &&
    Boolean(env.VITEST_WORKER_ID) && env.VERCEL !== "1";
}

/**
 * Keep the existing project allowlist and also reject Prisma connection-string
 * overrides that could escape that host or change the selected schema.
 * @param {string | undefined} value
 */
export function isSportsSharedCardIsolatedConnection(value) {
  if (!isIsolatedCourseConnection(value)) return false;
  try {
    const url = new URL(value ?? "");
    if (url.pathname !== "/postgres" || url.hash) return false;
    const direct = url.hostname === "db.ttworfzgwejdeolegkxl.supabase.co";
    if (url.username !== (direct ? "postgres" : "postgres.ttworfzgwejdeolegkxl")) return false;
    if (!(direct ? ["", "5432"] : ["", "5432", "6543"]).includes(url.port)) return false;
    const allowedOptions = new Set(["schema", "pgbouncer", "sslmode", "connection_limit", "pool_timeout", "connect_timeout", "socket_timeout", "statement_cache_size"]);
    for (const [key, option] of url.searchParams) {
      if (!allowedOptions.has(key) || url.searchParams.getAll(key).length !== 1) return false;
      if (key === "schema" && option !== "public") return false;
      if (key === "pgbouncer" && !["true", "false"].includes(option)) return false;
      if (key === "sslmode" && !["disable", "prefer", "require"].includes(option)) return false;
      if (!["schema", "pgbouncer", "sslmode"].includes(key) && !/^\d+$/.test(option)) return false;
      if (key === "connection_limit" && Number(option) < 1) return false;
    }
    return true;
  } catch { return false; }
}

/**
 * Temporary release-bound build/runtime preflight. This entire unmerged
 * checkout is authorized only for this Preview. Missing metadata never falls
 * back to another branch; production release requires a reviewed conversion.
 * VERCEL_ENV=preview also activates the existing runtime-env notification
 * suppression policy; there is no separate notification override to enable.
 * Never include connection values or credentials in an error.
 * @param {Readonly<Record<string, string | undefined>>} env
 */
export function assertSportsSharedCardPreviewEnvironment(env) {
  if (env.VERCEL_ENV !== "preview") {
    throw new Error("Sports shared-card branch requires VERCEL_ENV=preview with outbound notifications blocked.");
  }
  if (env.VERCEL_GIT_COMMIT_REF !== SPORTS_SHARED_CARD_PREVIEW_BRANCH ||
      env.VERCEL_GIT_REPO_OWNER !== "rock7652-beep" || env.VERCEL_GIT_REPO_SLUG !== "steamfoot-booking") {
    throw new Error("Sports shared-card checkout requires its exact authorized Preview branch and repository metadata.");
  }
  if (![env.DATABASE_URL, env.DIRECT_URL].every(isSportsSharedCardIsolatedConnection)) {
    throw new Error("Sports shared-card Preview requires the existing isolated database for both connections.");
  }
}
