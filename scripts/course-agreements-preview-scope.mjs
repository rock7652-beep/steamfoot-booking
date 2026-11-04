import { isSportsSharedCardIsolatedConnection } from './sports-shared-card-preview-scope.mjs';

export const COURSE_AGREEMENTS_PREVIEW_BRANCH = 'codex/agreements-1502-integration';
export const FITNESS_AGREEMENTS_PREVIEW_BRANCH = 'codex/fitness-agreements-preview';
export const BEAUTY_AGREEMENTS_PREVIEW_BRANCH = 'codex/beauty-agreements-preview';
export const ALL_MODULES_AGREEMENTS_PREVIEW_BRANCH = 'codex/all-modules-agreements-release';
export const AGREEMENT_PRIVACY_PREVIEW_BRANCH = 'fix/agreement-privacy-default';
const previewBranches = [COURSE_AGREEMENTS_PREVIEW_BRANCH, FITNESS_AGREEMENTS_PREVIEW_BRANCH, BEAUTY_AGREEMENTS_PREVIEW_BRANCH, ALL_MODULES_AGREEMENTS_PREVIEW_BRANCH, AGREEMENT_PRIVACY_PREVIEW_BRANCH];
export const COURSE_AGREEMENTS_DISABLED_LINE_TOKEN = 'disabled-course-agreements-rehearsal';

/** Exact, opt-in integration rehearsal; never accepts a production connection. */
export function assertCourseAgreementsPreviewEnvironment(env) {
  if (env.COURSE_AGREEMENTS_REVIEW !== '1' &&
      ![env.VERCEL_GIT_COMMIT_REF, env.WORKERS_CI_BRANCH, env.CF_PAGES_BRANCH].some(branch => previewBranches.includes(branch))) return false;
  const rejected = Object.entries({
    opt_in: env.COURSE_AGREEMENTS_REVIEW !== '1',
    provider: env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview',
    branch: !previewBranches.includes(env.VERCEL_GIT_COMMIT_REF),
    beauty_configuration: [BEAUTY_AGREEMENTS_PREVIEW_BRANCH, ALL_MODULES_AGREEMENTS_PREVIEW_BRANCH, AGREEMENT_PRIVACY_PREVIEW_BRANCH].includes(env.VERCEL_GIT_COMMIT_REF) && (env.BEAUTY_MODULE_ENABLED !== '1' || env.BEAUTY_AGREEMENTS_ENABLED !== '1' || env.BEAUTY_DATABASE_MODE !== 'legacy' || env.BEAUTY_NOTIFICATIONS_ENABLED !== '0' || [env.BEAUTY_DATABASE_URL, env.BEAUTY_DATABASE_ROLE, env.BEAUTY_DATABASE_PASSWORD].some(value => value !== undefined)),
    combined_configuration: [ALL_MODULES_AGREEMENTS_PREVIEW_BRANCH, AGREEMENT_PRIVACY_PREVIEW_BRANCH].includes(env.VERCEL_GIT_COMMIT_REF) && [env.COURSE_AGREEMENTS_ENABLED, env.COURSE_AGREEMENTS_PUBLIC_ENABLED, env.COURSE_AGREEMENTS_FITNESS_ENABLED, env.BEAUTY_AGREEMENTS_PUBLIC_ENABLED].some(value => value !== '1'),
    repository: env.VERCEL_GIT_REPO_OWNER !== 'rock7652-beep' || env.VERCEL_GIT_REPO_SLUG !== 'steamfoot-booking',
    conflicting_provider: Boolean(env.WORKERS_CI_BRANCH || env.CF_PAGES_BRANCH),
    // An explicit non-credential prevents provider inheritance of the global
    // token when an empty branch override is omitted by the deployment API.
    outbound_line: Boolean((env.LINE_CHANNEL_ACCESS_TOKEN && env.LINE_CHANNEL_ACCESS_TOKEN !== COURSE_AGREEMENTS_DISABLED_LINE_TOKEN) || (env.WEB_LINE_LOGIN_CHANNEL_SECRET && env.WEB_LINE_LOGIN_CHANNEL_SECRET !== COURSE_AGREEMENTS_DISABLED_LINE_TOKEN) || env.PREVIEW_LINE_ACCEPTANCE_ENABLED === '1'),
    database: !isSportsSharedCardIsolatedConnection(env.DATABASE_URL),
    direct_database: !isSportsSharedCardIsolatedConnection(env.DIRECT_URL),
  }).filter(([, invalid]) => invalid).map(([key]) => key);
  // Diagnostic names only: never log connections, tokens or their fragments.
  if (rejected.length) throw new Error(`Course agreement rehearsal rejected: ${rejected.join(',')}`);
  return true;
}
