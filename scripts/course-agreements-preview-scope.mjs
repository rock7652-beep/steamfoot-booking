import { isSportsSharedCardIsolatedConnection } from './sports-shared-card-preview-scope.mjs';

export const COURSE_AGREEMENTS_PREVIEW_BRANCH = 'codex/agreements-1502-integration';
export const COURSE_AGREEMENTS_DISABLED_LINE_TOKEN = 'disabled-course-agreements-rehearsal';

/** Exact, opt-in integration rehearsal; never accepts a production connection. */
export function assertCourseAgreementsPreviewEnvironment(env) {
  if (env.COURSE_AGREEMENTS_REVIEW !== '1' &&
      ![env.VERCEL_GIT_COMMIT_REF, env.WORKERS_CI_BRANCH, env.CF_PAGES_BRANCH].includes(COURSE_AGREEMENTS_PREVIEW_BRANCH)) return false;
  const rejected = Object.entries({
    opt_in: env.COURSE_AGREEMENTS_REVIEW !== '1',
    provider: env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview',
    branch: env.VERCEL_GIT_COMMIT_REF !== COURSE_AGREEMENTS_PREVIEW_BRANCH,
    repository: env.VERCEL_GIT_REPO_OWNER !== 'rock7652-beep' || env.VERCEL_GIT_REPO_SLUG !== 'steamfoot-booking',
    conflicting_provider: Boolean(env.WORKERS_CI_BRANCH || env.CF_PAGES_BRANCH),
    // An explicit non-credential prevents provider inheritance of the global
    // token when an empty branch override is omitted by the deployment API.
    outbound_line: Boolean((env.LINE_CHANNEL_ACCESS_TOKEN && env.LINE_CHANNEL_ACCESS_TOKEN !== COURSE_AGREEMENTS_DISABLED_LINE_TOKEN) || env.WEB_LINE_LOGIN_CHANNEL_SECRET || env.PREVIEW_LINE_ACCEPTANCE_ENABLED === '1'),
    database: !isSportsSharedCardIsolatedConnection(env.DATABASE_URL),
    direct_database: !isSportsSharedCardIsolatedConnection(env.DIRECT_URL),
  }).filter(([, invalid]) => invalid).map(([key]) => key);
  // Diagnostic names only: never log connections, tokens or their fragments.
  if (rejected.length) throw new Error(`Course agreement rehearsal rejected: ${rejected.join(',')}`);
  return true;
}
