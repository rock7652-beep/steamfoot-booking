import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { assertReviewedReleaseEnvironment, ROOM_PERFORMANCE_PREVIEW_BRANCH } from "../../scripts/consultation-preview-scope.mjs";

const isolated = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const env = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: ROOM_PERFORMANCE_PREVIEW_BRANCH,
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "", DATABASE_URL: isolated, DIRECT_URL: isolated,
};
it("accepts the exact room performance Preview and exits before any database or migration work", () => {
  expect(assertReviewedReleaseEnvironment(env)).toBe("module-roster-preview");
  const result = spawnSync(process.execPath, ["scripts/ci-migrate.mjs"], {
    env: {...process.env, ...env, GUIDE_UI_PREVIEW: "", PRODUCTION_MIGRATION_TARGET: "unapproved"}, encoding: "utf8", timeout: 10_000,
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("isolated_database=true notifications_blocked=true migrations_skipped=true");
  expect(result.stdout).not.toContain("recovery_preflight_started");
});
it.each(["DATABASE_URL", "DIRECT_URL"])("rejects a non-isolated %s before creating a runtime client", key => {
  expect(() => assertReviewedReleaseEnvironment({...env, [key]: "postgresql://production.invalid/db"})).toThrow("existing isolated database");
});
it.each(["VERCEL", "VERCEL_ENV", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG", "WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"])("rejects wrong provenance in %s", key => {
  expect(() => assertReviewedReleaseEnvironment({...env, [key]: "wrong"})).toThrow();
});
