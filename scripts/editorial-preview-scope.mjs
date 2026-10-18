export const EDITORIAL_PREVIEW_BRANCH = "content/editorial-preview";
export const EDITORIAL_REPOSITORY = "rock7652-beep/steamfoot-booking";
const commit = /^[0-9a-f]{40}$/;

// Non-secret approval pins are branch-scoped and set only after reviewing the
// exact content diff and CI. A later push cannot reuse an earlier approval.
export function isEditorialUiPreview(env = process.env) {
  const requested = [env.VERCEL_GIT_COMMIT_REF, env.WORKERS_CI_BRANCH, env.CF_PAGES_BRANCH].includes(EDITORIAL_PREVIEW_BRANCH) ||
    Boolean(env.EDITORIAL_PREVIEW_APPROVED_COMMIT) || Boolean(env.EDITORIAL_PREVIEW_BASE_COMMIT);
  if (!requested) return false;
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" ||
      env.VERCEL_GIT_COMMIT_REF !== EDITORIAL_PREVIEW_BRANCH ||
      `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}` !== EDITORIAL_REPOSITORY ||
      !commit.test(env.EDITORIAL_PREVIEW_APPROVED_COMMIT ?? "") ||
      !commit.test(env.EDITORIAL_PREVIEW_BASE_COMMIT ?? "") ||
      env.EDITORIAL_PREVIEW_APPROVED_COMMIT === "0".repeat(40) ||
      env.EDITORIAL_PREVIEW_BASE_COMMIT === "0".repeat(40) ||
      env.EDITORIAL_PREVIEW_BASE_COMMIT === env.EDITORIAL_PREVIEW_APPROVED_COMMIT ||
      env.VERCEL_GIT_COMMIT_SHA !== env.EDITORIAL_PREVIEW_APPROVED_COMMIT ||
      env.WORKERS_CI_BRANCH || env.CF_PAGES_BRANCH || env.GUIDE_UI_PREVIEW) {
    throw new Error("Editorial preview isolation rejected: exact repository, fixed branch and reviewed commit pair required");
  }
  return true;
}
