import { expect, it } from "vitest";
import { assertReviewedReleaseEnvironment } from "../../scripts/consultation-preview-scope.mjs";
const valid = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "fix/customer-line-binding-management-20261029",
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  DATABASE_URL: "postgresql://postgres:test@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",
  DIRECT_URL: "postgresql://postgres:test@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",
};
it("authorizes the original PR branch only as an isolated no-migration review", () => {
  expect(assertReviewedReleaseEnvironment(valid)).toBe("module-roster-preview");
});
it.each(["VERCEL_ENV", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG", "DATABASE_URL", "DIRECT_URL"])("rejects missing or spoofed %s", key => {
  expect(() => assertReviewedReleaseEnvironment({ ...valid, [key]: undefined })).toThrow();
  expect(() => assertReviewedReleaseEnvironment({ ...valid, [key]: "production" })).toThrow();
});
it.each(["WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"])("rejects Cloudflare provenance %s", key => {
  expect(() => assertReviewedReleaseEnvironment({ ...valid, [key]: valid.VERCEL_GIT_COMMIT_REF })).toThrow();
});
it("rejects connection overrides and a production target", () => {
  expect(() => assertReviewedReleaseEnvironment({ ...valid, DATABASE_URL: valid.DATABASE_URL + "?host=production" })).toThrow();
  expect(() => assertReviewedReleaseEnvironment({ ...valid, VERCEL_ENV: "production" })).toThrow();
});
