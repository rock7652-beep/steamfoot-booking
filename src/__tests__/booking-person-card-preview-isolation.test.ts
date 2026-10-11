import { afterEach, expect, it, vi } from "vitest";
import { assertReviewedReleaseEnvironment, BOOKING_PERSON_CARD_PREVIEW_BRANCH } from "../../scripts/consultation-preview-scope.mjs";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
const isolated = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const env = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BOOKING_PERSON_CARD_PREVIEW_BRANCH, VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking", DATABASE_URL: isolated, DIRECT_URL: isolated };
afterEach(() => vi.unstubAllEnvs());
it("accepts the exact person-card preview with isolated connections only", () => {
  expect(assertReviewedReleaseEnvironment(env)).toBe("module-roster-preview");
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    expect(() => assertReviewedReleaseEnvironment({ ...env, [key]: "postgresql://postgres:synthetic@production.invalid/postgres" })).toThrow();
  }
  for (const key of ["VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG"]) {
    expect(() => assertReviewedReleaseEnvironment({ ...env, [key]: "wrong" })).toThrow();
  }
});
it("blocks external notifications and does not treat production as preview", () => {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  expect(isPreviewExternalIntegrationBlocked()).toBe(true);
  expect(() => assertReviewedReleaseEnvironment({ ...env, VERCEL_ENV: "production" })).toThrow();
});
