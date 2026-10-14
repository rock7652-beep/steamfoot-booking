import { isIsolatedConsultationDatabaseUrl, COURSE_BUSINESS_BOUNDARIES_BRANCH } from "./consultation-preview-scope.mjs";

export { COURSE_BUSINESS_BOUNDARIES_BRANCH };

/** Guard the exact review candidate before migration subprocesses or DB clients. */
export function assertCourseBusinessBoundariesPreview(env) {
  if (![env.VERCEL_GIT_COMMIT_REF, env.WORKERS_CI_BRANCH, env.CF_PAGES_BRANCH].includes(COURSE_BUSINESS_BOUNDARIES_BRANCH)) return false;
  if (env.VERCEL_ENV !== "preview" || ![env.DATABASE_URL, env.DIRECT_URL].every(isIsolatedConsultationDatabaseUrl)) {
    throw new Error("Course business boundaries review requires Preview and both isolated database connections.");
  }
  return true;
}
