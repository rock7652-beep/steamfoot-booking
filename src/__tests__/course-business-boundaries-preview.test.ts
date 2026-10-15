import { assertReviewedReleaseEnvironment } from "../../scripts/consultation-preview-scope.mjs";
import { expect, it } from "vitest";
import { assertCourseBusinessBoundariesPreview, COURSE_BUSINESS_BOUNDARIES_BRANCH } from "../../scripts/course-business-boundaries-preview-scope.mjs";
const isolated = "postgresql://postgres:fixture@db.ttworfzgwejdeolegkxl.supabase.co/postgres";
const env = {VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:COURSE_BUSINESS_BOUNDARIES_BRANCH,DATABASE_URL:isolated,DIRECT_URL:isolated};
it("allows only the exact isolated Preview candidate", () => {
  expect(assertCourseBusinessBoundariesPreview(env)).toBe(true);
  expect(assertCourseBusinessBoundariesPreview({...env,VERCEL_GIT_COMMIT_REF:"main"})).toBe(false);
});
it.each([{VERCEL_ENV:"production"},{DIRECT_URL:undefined},{DATABASE_URL:undefined},
  {DIRECT_URL:"postgresql://postgres:fixture@db.qijlnhtpbintanzpxkvf.supabase.co/postgres"},
  {DATABASE_URL:isolated+"?options=-c%20search_path%3Dother"},
])("rejects unsafe candidate before migrations: %j", override => {
  expect(() => assertCourseBusinessBoundariesPreview({...env,...override})).toThrow("both isolated database connections");
});

it("registers the candidate with the Next configuration gate without widening other branches", () => {
  const deployed={...env,VERCEL:"1",VERCEL_GIT_REPO_OWNER:"rock7652-beep",VERCEL_GIT_REPO_SLUG:"steamfoot-booking"};
  expect(assertReviewedReleaseEnvironment(deployed)).toBe("module-roster-preview");
  expect(() => assertReviewedReleaseEnvironment({...deployed,DIRECT_URL:undefined})).toThrow();
  expect(() => assertReviewedReleaseEnvironment({...deployed,VERCEL_GIT_COMMIT_REF:"codex/unreviewed"})).toThrow();
});
