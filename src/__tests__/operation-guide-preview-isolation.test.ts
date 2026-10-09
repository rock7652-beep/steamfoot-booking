import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  assertOperationGuidePreviewEnvironment,
  assertReviewedReleaseEnvironment,
  OPERATION_GUIDE_PREVIEW_BRANCH,
} from "../../scripts/consultation-preview-scope.mjs";

const direct = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const pool = "postgresql://postgres.ttworfzgwejdeolegkxl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
const valid = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: OPERATION_GUIDE_PREVIEW_BRANCH,
  VERCEL_GIT_REPO_OWNER: "rock7652-beep",
  VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  WORKERS_CI_BRANCH: "",
  CF_PAGES_BRANCH: "",
  DATABASE_URL: pool,
  DIRECT_URL: direct,
};

describe("operation guide Preview isolation", () => {
  it("accepts only the exact branch on the existing isolated database", () => {
    expect(() => assertOperationGuidePreviewEnvironment(valid)).not.toThrow();
    expect(assertReviewedReleaseEnvironment(valid)).toBe("operation-guide-preview");
  });

  it.each(["VERCEL_GIT_COMMIT_REF", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG", "VERCEL_ENV"])("rejects invalid %s provenance", key => {
    expect(() => assertOperationGuidePreviewEnvironment({...valid, [key]: "wrong"})).toThrow("exact authorized Vercel branch");
  });

  it.each(["DATABASE_URL", "DIRECT_URL"])("rejects a non-isolated %s", key => {
    expect(() => assertOperationGuidePreviewEnvironment({...valid, [key]: "postgresql://production.invalid/db"})).toThrow("existing isolated database");
  });

  it("skips migrations before database work and blocks notifications by Preview policy", () => {
    const result = spawnSync(process.execPath, ["scripts/ci-migrate.mjs"], {
      env: {...process.env, ...valid, GUIDE_UI_PREVIEW: "", PRODUCTION_MIGRATION_TARGET: "unapproved"},
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[operation-guide-preview] isolated_database=true notifications_blocked=true migrations_skipped=true");
    expect(result.stdout).not.toContain("recovery_preflight_started");
  });
});
