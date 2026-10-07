// Non-secret, exact-target UI sandbox. No real database is permitted here.
export const GUIDE_UI_PREVIEW_BRANCH = "feat/public-guide-articles-20261007";
export const GUIDE_UI_PREVIEW_DATABASE_URL = "postgresql://guide-ui:guide-ui@127.0.0.1:9/guide_ui_preview";

/** @param {Record<string, string | undefined>} [env] */
export function isGuideUiPreview(env = process.env) {
  const branches = [env.VERCEL_GIT_COMMIT_REF, env.WORKERS_CI_BRANCH, env.CF_PAGES_BRANCH];
  const requested = branches.includes(GUIDE_UI_PREVIEW_BRANCH) || Boolean(env.GUIDE_UI_PREVIEW);
  if (!requested) return false;
  if (env.GUIDE_UI_PREVIEW !== "1" || env.VERCEL_ENV !== "preview" ||
      env.VERCEL_GIT_COMMIT_REF !== GUIDE_UI_PREVIEW_BRANCH ||
      Boolean(env.WORKERS_CI_BRANCH) || Boolean(env.CF_PAGES_BRANCH) ||
      env.DATABASE_URL !== GUIDE_UI_PREVIEW_DATABASE_URL ||
      env.DIRECT_URL !== GUIDE_UI_PREVIEW_DATABASE_URL) {
    throw new Error("Guide UI preview isolation rejected: exact preview branch and synthetic database configuration required");
  }
  return true;
}

// Never instantiate Prisma or reuse a cached client in this mode. All property
// access fails before a query, transaction, raw SQL, or connection can run.
export function createGuideUiDisabledClient() {
  return new Proxy(Object.create(null), {
    get(_target, property) {
      if (property === "then") return undefined;
      throw new Error("Guide UI preview has no database access");
    },
  });
}
