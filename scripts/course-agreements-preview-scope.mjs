import { isSportsSharedCardIsolatedConnection } from './sports-shared-card-preview-scope.mjs';

export const COURSE_AGREEMENTS_PREVIEW_BRANCH = 'codex/agreements-1502-integration';

/** Exact, opt-in integration rehearsal; never accepts a production connection. */
export function assertCourseAgreementsPreviewEnvironment(env) {
  if (env.COURSE_AGREEMENTS_REVIEW !== '1' &&
      ![env.VERCEL_GIT_COMMIT_REF, env.WORKERS_CI_BRANCH, env.CF_PAGES_BRANCH].includes(COURSE_AGREEMENTS_PREVIEW_BRANCH)) return false;
  if (env.COURSE_AGREEMENTS_REVIEW !== '1' || env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview' ||
      env.VERCEL_GIT_COMMIT_REF !== COURSE_AGREEMENTS_PREVIEW_BRANCH ||
      env.VERCEL_GIT_REPO_OWNER !== 'rock7652-beep' || env.VERCEL_GIT_REPO_SLUG !== 'steamfoot-booking' ||
      env.WORKERS_CI_BRANCH || env.CF_PAGES_BRANCH ||
      env.LINE_CHANNEL_ACCESS_TOKEN || env.WEB_LINE_LOGIN_CHANNEL_SECRET || env.PREVIEW_LINE_ACCEPTANCE_ENABLED === '1' ||
      ![env.DATABASE_URL, env.DIRECT_URL].every(isSportsSharedCardIsolatedConnection)) {
    throw new Error('Course agreement rehearsal requires its exact Vercel Preview branch, isolated database and disabled outbound LINE.');
  }
  return true;
}
