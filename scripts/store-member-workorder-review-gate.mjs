export const STORE_MEMBER_WORKORDER_REVIEW_BRANCH = 'feat/store-member-link-workorder-line-20261012';

/** This schema-dependent review must not auto-deploy or run migrations before
 * separate authorization for the exact isolated database and SQL. */
/** @param {Record<string, string | undefined>} env */
export function assertStoreMemberWorkorderReviewOnly(env = process.env) {
  if ([env.VERCEL_GIT_COMMIT_REF, env.WORKERS_CI_BRANCH, env.CF_PAGES_BRANCH].includes(STORE_MEMBER_WORKORDER_REVIEW_BRANCH)) {
    throw new Error('Store member/work-order review branch deployment is disabled pending isolated schema and Preview authorization. No migration or database access is allowed.');
  }
}
