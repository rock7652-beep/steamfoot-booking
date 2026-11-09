import { expect, it } from "vitest";
import { assertReviewedReleaseEnvironment, STEAM_BOOKING_COMPACT_PREVIEW_BRANCH } from "../../scripts/consultation-preview-scope.mjs";
const isolated = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const valid = {VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:STEAM_BOOKING_COMPACT_PREVIEW_BRANCH,VERCEL_GIT_REPO_OWNER:"rock7652-beep",VERCEL_GIT_REPO_SLUG:"steamfoot-booking",DATABASE_URL:isolated,DIRECT_URL:isolated,BOOKING_PARTICIPANTS_ENABLED:"true",CONSULTATION_PREVIEW_INTAKE_ENABLED:"false"};
it("uses the migration-skipping module review mode only for the authorized isolated preview",()=>{
  expect(assertReviewedReleaseEnvironment(valid)).toBe("module-roster-preview");
});
for (const change of [
  {VERCEL_ENV:"production"}, {VERCEL_GIT_COMMIT_REF:"unapproved-preview"},
  {VERCEL_GIT_REPO_OWNER:"wrong"}, {VERCEL_GIT_REPO_SLUG:"wrong"},
  {DATABASE_URL:"postgresql://postgres:synthetic@production.invalid/postgres"},
  {DIRECT_URL:"postgresql://postgres:synthetic@production.invalid/postgres"},
  {BOOKING_PARTICIPANTS_ENABLED:"false"}, {CONSULTATION_PREVIEW_INTAKE_ENABLED:"true"},
  {WORKERS_CI_BRANCH:STEAM_BOOKING_COMPACT_PREVIEW_BRANCH}, {CF_PAGES_BRANCH:STEAM_BOOKING_COMPACT_PREVIEW_BRANCH},
]) {
  it(`rejects an unsafe preview override: ${Object.keys(change)[0]}`,()=>{
    expect(()=>assertReviewedReleaseEnvironment({...valid,...change})).toThrow();
  });
}
