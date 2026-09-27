import { describe, expect, it } from "vitest";
import { requiresCoursePreviewCheck, isIsolatedCourseConnection } from "../../scripts/course-preview-scope.mjs";

describe("course preview isolation", () => {
  it.each(["codex/course-scheduling-stage1", "codex/course-trial-retention-30-days", "codex/course-monthly-settlement", "codex/course-monthly-usability"])("checks %s before accessing a database", branch => {
    expect(requiresCoursePreviewCheck({VERCEL_ENV:"preview", VERCEL_GIT_COMMIT_REF:branch})).toBe(true);
    expect(requiresCoursePreviewCheck({VERCEL_ENV:"production", VERCEL_GIT_COMMIT_REF:branch})).toBe(false);
  });
  it("leaves unrelated branches unchanged", () => {
    expect(requiresCoursePreviewCheck({VERCEL_ENV:"preview", VERCEL_GIT_COMMIT_REF:"fix/steamfoot"})).toBe(false);
  });
  it.each([
    "postgresql://postgres:fixture@db.ttworfzgwejdeolegkxl.supabase.co/postgres",
    "postgres://postgres.ttworfzgwejdeolegkxl:fixture@aws-0-ap-northeast-1.pooler.supabase.com/postgres",
  ])("accepts the isolated destination %s", url => expect(isIsolatedCourseConnection(url)).toBe(true));
  it.each([
    undefined, "", "invalid", "https://db.ttworfzgwejdeolegkxl.supabase.co/postgres",
    "postgresql://postgres:fixture@db.qijlnhtpbintanzpxkvf.supabase.co/postgres",
    "postgresql://postgres.qijlnhtpbintanzpxkvf:fixture@aws-0-ap-northeast-1.pooler.supabase.com/postgres",
    "postgresql://postgres.ttworfzgwejdeolegkxl:fixture@example.com/postgres",
  ])("rejects unverified destination %s", url => expect(isIsolatedCourseConnection(url)).toBe(false));
});
