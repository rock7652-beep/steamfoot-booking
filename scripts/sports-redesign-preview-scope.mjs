import { isSportsSharedCardIsolatedConnection } from './sports-shared-card-preview-scope.mjs';
export const SPORTS_REDESIGN_PREVIEW_BRANCH = 'codex/sports-redesign-staging-20261018';
/** Deployment opt-in is separate from the unchanged localhost QA boundary. */
export function assertSportsRedesignPreviewEnvironment(env) {
  if (env.SPORTS_REDESIGN_STAGING !== '1' || env.SPORTS_REDESIGN_PREVIEW !== '1' ||
      env.SPORTS_LIVE_FLOW_QA || env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview' ||
      env.VERCEL_GIT_COMMIT_REF !== SPORTS_REDESIGN_PREVIEW_BRANCH ||
      env.VERCEL_GIT_REPO_OWNER !== 'rock7652-beep' || env.VERCEL_GIT_REPO_SLUG !== 'steamfoot-booking' ||
      env.WORKERS_CI_BRANCH || env.CF_PAGES_BRANCH ||
      ![env.DATABASE_URL, env.DIRECT_URL].every(isSportsSharedCardIsolatedConnection)) {
    throw new Error('Sports redesign Preview requires its exact branch, repository and isolated test database; production is forbidden.');
  }
}
