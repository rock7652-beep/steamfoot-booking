import { isMusicOpeningDatabase } from './music-opening-preview-scope.mjs';

export const COURSE_PHONE_A_PREVIEW_BRANCH = 'codex/course-liff-ui-20260922';
export const COURSE_PHONE_A_STORE = 'store-course-start-0918-a';

/** User-authorized A-store rehearsal only. Validate before any DB client,
 * including callers which skip package.json's build command. Never print env. */
export function assertCoursePhoneAPreview(env) {
  const refs = [env.VERCEL_GIT_COMMIT_REF, env.WORKERS_CI_BRANCH, env.CF_PAGES_BRANCH];
  if (!refs.includes(COURSE_PHONE_A_PREVIEW_BRANCH)) return false;
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview' ||
      env.VERCEL_GIT_COMMIT_REF !== COURSE_PHONE_A_PREVIEW_BRANCH ||
      env.VERCEL_GIT_REPO_OWNER !== 'rock7652-beep' || env.VERCEL_GIT_REPO_SLUG !== 'steamfoot-booking' ||
      env.WORKERS_CI_BRANCH || env.CF_PAGES_BRANCH) throw Error('A-store phone Preview provenance rejected');
  if (![env.DATABASE_URL, env.DIRECT_URL].every(isMusicOpeningDatabase)) throw Error('A-store phone Preview requires both isolated connections');
  if (env.ADDONS_DATABASE_URL || env.ADDONS_DIRECT_URL || env.BEAUTY_DATABASE_URL || env.BEAUTY_DIRECT_URL ||
      env.COURSE_DATABASE_URL || env.PRODUCTION_MIGRATION_TARGET || env.DIGITAL_MANAGER_MIGRATION_QA ||
      env.PREVIEW_LINE_ACCEPTANCE_ENABLED === '1' || env.BEAUTY_NOTIFICATIONS_ENABLED === '1') {
    throw Error('A-store phone Preview cannot select another database, migration or outbound mode');
  }
  if (!env.AUTH_SECRET) throw Error('A-store phone Preview requires its existing session configuration');
  let configs;
  try { configs = JSON.parse(env.STORE_LINE_CONFIG_JSON ?? ''); } catch { throw Error('A-store LINE configuration unavailable'); }
  if (!Array.isArray(configs) || configs.length !== 1 || configs[0].storeId !== COURSE_PHONE_A_STORE ||
      configs[0].slug !== 'course-start-0918-a' || configs[0].liffId !== '2010761154-2BkMDceh') {
    throw Error('A-store phone Preview requires the existing A-store LINE entry');
  }
  return true;
}
