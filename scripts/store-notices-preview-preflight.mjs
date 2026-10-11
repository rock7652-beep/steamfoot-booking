import { isSelfBookingPreviewDatabaseUrl } from "./course-self-booking-preview-scope.mjs";
// Validate the isolated connections before any client or migration is created.
export const STORE_NOTICE_REVIEW_BRANCH="feat/store-notification-center-20261011";
export function assertStoreNoticeReviewBuild(env=process.env){
 if(![env.VERCEL_GIT_COMMIT_REF,env.WORKERS_CI_BRANCH,env.CF_PAGES_BRANCH].includes(STORE_NOTICE_REVIEW_BRANCH))return;
 if(env.VERCEL!=="1"||env.VERCEL_ENV!=="preview"||env.VERCEL_GIT_COMMIT_REF!==STORE_NOTICE_REVIEW_BRANCH||env.VERCEL_GIT_REPO_OWNER!=="rock7652-beep"||env.VERCEL_GIT_REPO_SLUG!=="steamfoot-booking"||env.WORKERS_CI_BRANCH||env.CF_PAGES_BRANCH)
  throw new Error("Store notices require the exact authorized Vercel Preview branch and repository.");
 if(![env.DATABASE_URL,env.DIRECT_URL].every(isSelfBookingPreviewDatabaseUrl))
  throw new Error("Store notices require the existing isolated database for both connections.");
}
if(import.meta.url===`file://${process.argv[1]}`)assertStoreNoticeReviewBuild();
