const COURSE_PREVIEW_BRANCHES = new Set([
  "codex/course-scheduling-stage1",
  "codex/course-trial-retention-30-days",
]);

export function requiresCoursePreviewCheck(env) {
  return env.VERCEL_ENV === "preview" && COURSE_PREVIEW_BRANCHES.has(env.VERCEL_GIT_COMMIT_REF);
}

export function isIsolatedCourseConnection(value) {
  const testRef = "ttworfzgwejdeolegkxl";
  try {
    const u = new URL(value ?? "");
    return ["postgres:", "postgresql:"].includes(u.protocol) && (
      u.hostname === `db.${testRef}.supabase.co` ||
      (/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname) &&
       u.username === `postgres.${testRef}`)
    );
  } catch { return false; }
}
