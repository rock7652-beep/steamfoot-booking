// Non-secret, exact-target UI sandbox. No real database is permitted here.
export const GUIDE_UI_PREVIEW_BRANCH = "feat/public-guide-articles-20261007";
export const GUIDE_UI_PREVIEW_DATABASE_URL = "postgresql://guide-ui:guide-ui@127.0.0.1:9/guide_ui_preview";

// Read-only trial-form QA has no database or notification capability. The exact
// Vercel Git provenance activates the disabled-client path before all DB guards;
// existing project credentials are never used or replaced.
export const TRIAL_UI_PREVIEW_BRANCH = "fix/simplify-trial-line-fields-20261008";

/** @param {Record<string, string | undefined>} [env] */
export function isTrialUiPreview(env = process.env) {
  const branches = [env.VERCEL_GIT_COMMIT_REF, env.WORKERS_CI_BRANCH, env.CF_PAGES_BRANCH];
  if (!branches.includes(TRIAL_UI_PREVIEW_BRANCH)) return false;
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" ||
      env.VERCEL_GIT_COMMIT_REF !== TRIAL_UI_PREVIEW_BRANCH ||
      env.VERCEL_GIT_REPO_OWNER !== "rock7652-beep" || env.VERCEL_GIT_REPO_SLUG !== "steamfoot-booking" ||
      Boolean(env.WORKERS_CI_BRANCH) || Boolean(env.CF_PAGES_BRANCH)) {
    throw new Error("Trial UI preview isolation rejected: exact Vercel Preview branch and repository required");
  }
  return true;
}

// The publication preview is a read-only editorial projection. Exact Vercel
// provenance selects the existing disabled clients, write gate and sender blocks;
// inherited project credentials are never read or used by those clients.
/** @param {Record<string, string | undefined>} env */
function isWaitlistUiPreview(env) {
  const branch = "content/yoga-waitlist-management";
  const branches = [env.VERCEL_GIT_COMMIT_REF, env.WORKERS_CI_BRANCH, env.CF_PAGES_BRANCH];
  if (!branches.includes(branch)) return false;
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" ||
      env.VERCEL_GIT_COMMIT_REF !== branch ||
      env.VERCEL_GIT_REPO_OWNER !== "rock7652-beep" || env.VERCEL_GIT_REPO_SLUG !== "steamfoot-booking" ||
      Boolean(env.WORKERS_CI_BRANCH) || Boolean(env.CF_PAGES_BRANCH)) {
    throw new Error("Waitlist UI preview isolation rejected: exact Vercel Preview branch and repository required");
  }
  return true;
}

// Exact HQ KPI-only review: no database, auth, writes or real customer records.
export const HQ_USAGE_UI_PREVIEW_BRANCH = "fix/hq-automatic-reminder-total";
/** @param {Record<string, string | undefined>} [env] */
export function isHqUsageUiPreview(env = process.env) {
  const branches = [env.VERCEL_GIT_COMMIT_REF, env.WORKERS_CI_BRANCH, env.CF_PAGES_BRANCH];
  if (!branches.includes(HQ_USAGE_UI_PREVIEW_BRANCH)) return false;
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" ||
      env.VERCEL_GIT_COMMIT_REF !== HQ_USAGE_UI_PREVIEW_BRANCH ||
      env.VERCEL_GIT_REPO_OWNER !== "rock7652-beep" || env.VERCEL_GIT_REPO_SLUG !== "steamfoot-booking" ||
      Boolean(env.WORKERS_CI_BRANCH) || Boolean(env.CF_PAGES_BRANCH)) {
    throw new Error("HQ usage preview isolation rejected: exact Vercel Preview branch and repository required");
  }
  return true;
}

/** @param {Record<string, string | undefined>} [env] */
export function isGuideUiPreview(env = process.env) {
  if (isHqUsageUiPreview(env) || isTrialUiPreview(env) || isWaitlistUiPreview(env)) return true;
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
