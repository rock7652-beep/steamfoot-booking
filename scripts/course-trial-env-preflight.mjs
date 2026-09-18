import { pathToFileURL } from "node:url";

/** Read-only environment validation. No connection, migration or secret output. */
export function assertCourseTrialEnvironment(env) {
  if (env.VERCEL_ENV !== "preview") throw new Error("Trial build requires preview target");
  const ref = env.COURSE_TRIAL_DATABASE_REF;
  if (!/^[a-z]{20}$/.test(ref ?? "") || ["qijlnhtpbintanzpxkvf", "ttworfzgwejdeolegkxl"].includes(ref)) throw new Error("Separate approved trial database required");
  if (!env.COURSE_TRIAL_VERCEL_PROJECT_ID?.startsWith("prj_") || env.COURSE_TRIAL_VERCEL_PROJECT_ID === "prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR" || env.VERCEL_PROJECT_ID !== env.COURSE_TRIAL_VERCEL_PROJECT_ID) throw new Error("Separate approved trial deployment project required");
  if (!/^[a-f0-9]{40}$/.test(env.COURSE_TRIAL_APPROVED_SHA ?? "") || env.VERCEL_GIT_COMMIT_SHA !== env.COURSE_TRIAL_APPROVED_SHA) throw new Error("Trial commit has not been approved");
  let origin;
  try { origin = new URL(env.COURSE_TRIAL_ORIGIN); } catch { throw new Error("Trial origin missing"); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || env.NEXTAUTH_URL !== origin.origin) throw new Error("Fixed trial/auth origin mismatch");
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    let url;
    try { url = new URL(env[key]); } catch { throw new Error("Trial database connection missing"); }
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !(url.hostname === `db.${ref}.supabase.co` || (/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && url.username === `postgres.${ref}`))) throw new Error("Trial database target mismatch");
  }
  if (!env.COURSE_LIFF_REQUIRED_STORE_SLUGS?.split(",").every(slug => /^[a-z0-9-]+$/.test(slug.trim()))) throw new Error("Explicit trial LIFF cohort required");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { assertCourseTrialEnvironment(process.env); console.info("[course-trial-preflight] approved isolated target and version verified; no migrations executed"); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
