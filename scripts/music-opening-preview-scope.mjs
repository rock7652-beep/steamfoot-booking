import { isSportsSharedCardIsolatedConnection } from "./sports-shared-card-preview-scope.mjs";

/** Exact scope of this unmerged music-opening Preview. Never expands access. */
export const MUSIC_OPENING_BRANCH = "feat/music-opening-state-20261007";
export const MUSIC_OPENING_PROJECT_REF = "ttworfzgwejdeolegkxl";
export const MUSIC_OPENING_STORE = "store-lubymusic";

export function isMusicOpeningDatabase(value) {
  if (!isSportsSharedCardIsolatedConnection(value)) return false;
  try {
    const url = new URL(value ?? "");
    // Prisma accepts query-level host/schema overrides. Reject unknown or duplicate
    // options before constructing a client, even when the visible hostname is safe.
    const allowedOptions = new Set(["schema", "pgbouncer", "sslmode", "connection_limit", "pool_timeout", "connect_timeout", "socket_timeout", "statement_cache_size"]);
    for (const key of url.searchParams.keys()) {
      if (!allowedOptions.has(key) || url.searchParams.getAll(key).length !== 1) return false;
    }
    if (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public") return false;
    if (url.hash || !["", "5432", "6543"].includes(url.port)) return false;
    return ["postgres:", "postgresql:"].includes(url.protocol) && url.pathname === "/postgres" && (
      (url.hostname === `db.${MUSIC_OPENING_PROJECT_REF}.supabase.co` && url.username === "postgres") ||
      (/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && url.username === `postgres.${MUSIC_OPENING_PROJECT_REF}`)
    );
  } catch { return false; }
}

/** Must execute before creating any DB client; never prints supplied values. */
export function assertMusicOpeningPreviewEnvironment(env) {
  if (env.VERCEL_ENV !== "preview" || env.VERCEL_GIT_COMMIT_REF !== MUSIC_OPENING_BRANCH ||
      env.VERCEL_GIT_REPO_OWNER !== "rock7652-beep" || env.VERCEL_GIT_REPO_SLUG !== "steamfoot-booking" ||
      Boolean(env.WORKERS_CI_BRANCH) || Boolean(env.CF_PAGES_BRANCH)) {
    throw new Error("Music opening build/runtime requires its exact authorized Preview branch and repository.");
  }
  if (![env.DATABASE_URL, env.DIRECT_URL].every(isMusicOpeningDatabase)) {
    throw new Error("Music opening requires both existing isolated database connections; no fallback is permitted.");
  }
}
