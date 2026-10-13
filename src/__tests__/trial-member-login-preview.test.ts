import { describe, expect, it } from "vitest";
import { assertReviewedReleaseEnvironment } from "../../scripts/consultation-preview-scope.mjs";

const env = {
  VERCEL: "1", VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "fix/trial-first-member-login-20261013",
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  DATABASE_URL: "postgresql://postgres:fixture@db.ttworfzgwejdeolegkxl.supabase.co/postgres",
  DIRECT_URL: "postgresql://postgres:fixture@db.ttworfzgwejdeolegkxl.supabase.co/postgres",
};

describe("trial member login preview isolation", () => {
  it("uses the existing migration-free isolated preview mode", () => {
    expect(assertReviewedReleaseEnvironment(env)).toBe("module-roster-preview");
  });
  it.each(["DATABASE_URL", "DIRECT_URL"])("rejects a production destination in %s", key => {
    expect(() => assertReviewedReleaseEnvironment({ ...env, [key]: "postgresql://postgres:fixture@db.qijlnhtpbintanzpxkvf.supabase.co/postgres" })).toThrow();
  });
  it("rejects unrelated deployment provenance", () => {
    expect(() => assertReviewedReleaseEnvironment({ ...env, VERCEL_GIT_REPO_OWNER: "other" })).toThrow();
  });
});
