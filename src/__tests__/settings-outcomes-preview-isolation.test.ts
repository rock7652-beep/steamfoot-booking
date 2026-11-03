import { expect, it } from "vitest";
import { assertReviewedReleaseEnvironment } from "../../scripts/consultation-preview-scope.mjs";
import { SETTINGS_OUTCOMES_PREVIEW_BRANCH } from "../../scripts/sports-redesign-preview-scope.mjs";

const isolated = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const valid = {
  SPORTS_REDESIGN_STAGING: "1", SPORTS_REDESIGN_PREVIEW: "1",
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: SETTINGS_OUTCOMES_PREVIEW_BRANCH,
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  DATABASE_URL: isolated, DIRECT_URL: isolated,
};

it("permits only the reviewed isolated outcomes Preview", () => {
  expect(assertReviewedReleaseEnvironment(valid)).toBe("sports-redesign-preview");
});

it.each([
  { VERCEL_ENV: "production" },
  { VERCEL_GIT_COMMIT_REF: `${SETTINGS_OUTCOMES_PREVIEW_BRANCH}-copy` },
  { VERCEL_GIT_REPO_OWNER: "other" },
  { DATABASE_URL: isolated.replace("ttworfzgwejdeolegkxl", "qijlnhtpbintanzpxkvf") },
  { DIRECT_URL: "" },
  { WORKERS_CI_BRANCH: SETTINGS_OUTCOMES_PREVIEW_BRANCH },
])("rejects unsafe deployment provenance or connections %j", patch => {
  expect(() => assertReviewedReleaseEnvironment({ ...valid, ...patch })).toThrow();
});
