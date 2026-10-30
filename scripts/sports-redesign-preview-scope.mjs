import { isSportsSharedCardIsolatedConnection } from './sports-shared-card-preview-scope.mjs';
export const SPORTS_REDESIGN_PREVIEW_BRANCH = 'codex/sports-redesign-staging-20261018';
export const SPORTS_CARD_MODES_PREVIEW_BRANCH = 'fix/sports-item-and-universal-cards-20261020';
export const SPORTS_OPENING_GUIDE_PREVIEW_BRANCH = 'fix/sports-common-opening-guide-20261020';
export const SPORTS_COACH_COMPENSATION_PREVIEW_BRANCH = 'fix/sports-coach-compensation-20261020';
export const SETTINGS_OUTCOMES_PREVIEW_BRANCH = 'fix/settings-save-outcomes-20261021';
export const YOUNGSKY_SETTINGS_PREVIEW_BRANCH = 'fix/youngsky-settings-confirmed-collapse';
const previewBranches=["perf/sports-course-loading",SETTINGS_OUTCOMES_PREVIEW_BRANCH,YOUNGSKY_SETTINGS_PREVIEW_BRANCH,SPORTS_REDESIGN_PREVIEW_BRANCH,SPORTS_CARD_MODES_PREVIEW_BRANCH,SPORTS_OPENING_GUIDE_PREVIEW_BRANCH,SPORTS_COACH_COMPENSATION_PREVIEW_BRANCH];
/** Deployment opt-in is separate from the unchanged localhost QA boundary. */
export function assertSportsRedesignPreviewEnvironment(env) {
  if (env.SPORTS_REDESIGN_STAGING !== '1' || env.SPORTS_REDESIGN_PREVIEW !== '1' ||
      env.SPORTS_LIVE_FLOW_QA || env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview' ||
      !previewBranches.includes(env.VERCEL_GIT_COMMIT_REF) ||
      env.VERCEL_GIT_REPO_OWNER !== 'rock7652-beep' || env.VERCEL_GIT_REPO_SLUG !== 'steamfoot-booking' ||
      env.WORKERS_CI_BRANCH || env.CF_PAGES_BRANCH ||
      ![env.DATABASE_URL, env.DIRECT_URL].every(isSportsSharedCardIsolatedConnection)) {
    throw new Error('Sports redesign Preview requires its exact branch, repository and isolated test database; production is forbidden.');
  }
}
