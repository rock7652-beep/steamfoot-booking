import { describe, expect, it } from "vitest";
import { assertStoreNoticeReviewBuild, STORE_NOTICE_REVIEW_BRANCH } from "../../scripts/store-notices-preview-preflight.mjs";
import { assertReviewedReleaseEnvironment } from "../../scripts/consultation-preview-scope.mjs";

const env = {
  NODE_ENV: "test" as const,
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: STORE_NOTICE_REVIEW_BRANCH,
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  DATABASE_URL: "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",
  DIRECT_URL: "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",
};

describe("store notice isolated preview", () => {
  it("allows the exact isolated branch and skips migration mode", () => {
    expect(() => assertStoreNoticeReviewBuild(env)).not.toThrow();
    expect(assertReviewedReleaseEnvironment(env)).toBe("module-roster-preview");
  });
  it.each(["DATABASE_URL", "DIRECT_URL"])("rejects a non-isolated %s", key => {
    expect(() => assertStoreNoticeReviewBuild({ ...env, [key]: "postgresql://postgres:synthetic@db.qijlnhtpbintanzpxkvf.supabase.co/postgres" })).toThrow(/isolated/);
  });
  it.each([
    { VERCEL_ENV: "production" }, { VERCEL_GIT_REPO_OWNER: "other" },
    { WORKERS_CI_BRANCH: STORE_NOTICE_REVIEW_BRANCH }, { CF_PAGES_BRANCH: STORE_NOTICE_REVIEW_BRANCH },
    { DATABASE_URL: env.DATABASE_URL + "?schema=other" },
    { DIRECT_URL: env.DIRECT_URL + "?host=other" },
  ])("fails closed for invalid routing or environment", overrides => {
    expect(() => assertStoreNoticeReviewBuild({ ...env, ...overrides })).toThrow();
  });
  it("does not change ordinary production main", () => {
    expect(() => assertStoreNoticeReviewBuild({ NODE_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" })).not.toThrow();
  });
});
