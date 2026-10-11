// Never inherit a production database or auto-migrate from this review branch.
export const STORE_NOTICE_REVIEW_BRANCH="feat/store-notification-center-20261011";
export function assertStoreNoticeReviewBuild(env=process.env){
 if([env.VERCEL_GIT_COMMIT_REF,env.WORKERS_CI_BRANCH,env.CF_PAGES_BRANCH].includes(STORE_NOTICE_REVIEW_BRANCH))
  throw new Error("Store notification review deployment requires isolated schema/runtime verification; automatic build disabled.");
}
if(import.meta.url===`file://${process.argv[1]}`)assertStoreNoticeReviewBuild();
