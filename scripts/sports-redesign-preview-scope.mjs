import { isSportsSharedCardIsolatedConnection, SCHEDULE_CONFLICT_PREVIEW_BRANCH, CALENDAR_PHASE_PREVIEW_BRANCH } from './sports-shared-card-preview-scope.mjs';
export const SPORTS_REDESIGN_PREVIEW_BRANCH = 'codex/sports-redesign-staging-20261018';
export const SPORTS_CARD_MODES_PREVIEW_BRANCH = 'fix/sports-item-and-universal-cards-20261020';
export const SPORTS_OPENING_GUIDE_PREVIEW_BRANCH = 'fix/sports-common-opening-guide-20261020';
export const SPORTS_COACH_COMPENSATION_PREVIEW_BRANCH = 'fix/sports-coach-compensation-20261020';
export const SETTINGS_OUTCOMES_PREVIEW_BRANCH = 'fix/settings-save-outcomes-20261021';
export const YOUNGSKY_SETTINGS_PREVIEW_BRANCH = 'fix/youngsky-settings-confirmed-collapse';
export const SILVERLILY_CALENDAR_PREVIEW_BRANCH = "fix/silverlily-calendar-loading-20261031";
export const MIXED_ENROLLMENT_PREVIEW_BRANCH = "feat/mixed-course-enrollment-20261109";
const previewBranches=[SILVERLILY_CALENDAR_PREVIEW_BRANCH,"fix/beauty-collection-calendar-remount","fix/calendar-restored-month-consistency","review/plan-management-sports-performance","perf/sports-course-loading",SETTINGS_OUTCOMES_PREVIEW_BRANCH,YOUNGSKY_SETTINGS_PREVIEW_BRANCH,SPORTS_REDESIGN_PREVIEW_BRANCH,SPORTS_CARD_MODES_PREVIEW_BRANCH,SPORTS_OPENING_GUIDE_PREVIEW_BRANCH,SPORTS_COACH_COMPENSATION_PREVIEW_BRANCH];
/** Deployment opt-in is separate from the unchanged localhost QA boundary. */
export function assertSportsRedesignPreviewEnvironment(env) {
  if (env.SPORTS_REDESIGN_STAGING !== '1' || env.SPORTS_REDESIGN_PREVIEW !== '1' ||
      env.SPORTS_LIVE_FLOW_QA || env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview' ||
      ![...previewBranches,SCHEDULE_CONFLICT_PREVIEW_BRANCH,CALENDAR_PHASE_PREVIEW_BRANCH,MIXED_ENROLLMENT_PREVIEW_BRANCH].includes(env.VERCEL_GIT_COMMIT_REF) ||
      env.VERCEL_GIT_REPO_OWNER !== 'rock7652-beep' || env.VERCEL_GIT_REPO_SLUG !== 'steamfoot-booking' ||
      env.WORKERS_CI_BRANCH || env.CF_PAGES_BRANCH ||
      ![env.DATABASE_URL, env.DIRECT_URL].every(isSportsSharedCardIsolatedConnection)) {
    throw new Error('Sports redesign Preview requires its exact branch, repository and isolated test database; production is forbidden.');
  }
  if (env.VERCEL_GIT_COMMIT_REF === MIXED_ENROLLMENT_PREVIEW_BRANCH &&
      (env.VERCEL_PROJECT_ID !== 'prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR' || env.COURSE_MIXED_ENROLLMENT_PREVIEW !== '1' ||
       env.PRODUCTION_MIGRATION_TARGET || Object.entries(env).some(([key,value])=>Boolean(value)&&
        /^(?:(?:LINE_|WEB_LINE_|STEAM_BUTLER_LINE_|MESSENGER_).*(?:TOKEN|SECRET)|RESEND_API_KEY|SMTP_|STORE_LINE_ADDITIONAL_CONFIG_JSON)/.test(key)))) {
    const configuredDeliveryKeys=Object.entries(env).filter(([key,value])=>Boolean(value)&&/^(?:(?:LINE_|WEB_LINE_|STEAM_BUTLER_LINE_|MESSENGER_).*(?:TOKEN|SECRET)|RESEND_API_KEY|SMTP_|STORE_LINE_ADDITIONAL_CONFIG_JSON)/.test(key)).map(([key])=>key);
    throw new Error(`Mixed enrollment Preview requires its exact project, opt-in, isolated database and disabled delivery credentials. project_match=${env.VERCEL_PROJECT_ID==='prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR'} opt_in=${env.COURSE_MIXED_ENROLLMENT_PREVIEW==='1'} migration_target_present=${Boolean(env.PRODUCTION_MIGRATION_TARGET)} configured_delivery_keys=${configuredDeliveryKeys.join(',')||'none'}`);
  }
}
