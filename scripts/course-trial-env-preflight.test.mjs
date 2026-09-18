import { test } from "node:test";
import assert from "node:assert/strict";
import { assertCourseTrialEnvironment } from "./course-trial-env-preflight.mjs";
const base = () => ({
  VERCEL_ENV: "preview", COURSE_TRIAL_DATABASE_REF: "abcdefghijklmnopqrst",
  COURSE_TRIAL_VERCEL_PROJECT_ID: "prj_isolated", VERCEL_PROJECT_ID: "prj_isolated",
  COURSE_TRIAL_APPROVED_SHA: "a".repeat(40), VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
  COURSE_TRIAL_ORIGIN: "https://trial.example.test", NEXTAUTH_URL: "https://trial.example.test",
  COURSE_LIFF_REQUIRED_STORE_SLUGS: "pilot-a",
  DATABASE_URL: "postgresql://postgres.abcdefghijklmnopqrst:test@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres",
  DIRECT_URL: "postgresql://postgres:test@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
});
test("accepts only a separately pinned preview environment", () => assert.doesNotThrow(() => assertCourseTrialEnvironment(base())));
for (const patch of [
  { VERCEL_ENV: "production" }, { COURSE_TRIAL_DATABASE_REF: "qijlnhtpbintanzpxkvf" },
  { COURSE_TRIAL_DATABASE_REF: "ttworfzgwejdeolegkxl" }, { DIRECT_URL: "postgresql://test@db.qijlnhtpbintanzpxkvf.supabase.co/postgres" },
  { VERCEL_PROJECT_ID: "prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR" }, { VERCEL_GIT_COMMIT_SHA: "b".repeat(40) },
  { NEXTAUTH_URL: "https://other.example.test" }, { COURSE_TRIAL_ORIGIN: "https://user:secret@trial.example.test" },
  { COURSE_LIFF_REQUIRED_STORE_SLUGS: "" },
]) test(`rejects unsafe ${Object.keys(patch)[0]} ${Object.values(patch)[0] === "production" ? "production" : "mismatch"}`, () => assert.throws(() => assertCourseTrialEnvironment({ ...base(), ...patch })));
