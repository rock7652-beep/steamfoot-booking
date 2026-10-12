import { afterEach, expect, it, vi } from "vitest";
import { assertReviewedReleaseEnvironment, BOOKING_PERSON_CARD_PREVIEW_BRANCH, CUSTOMER_UNIFIED_DETAIL_PREVIEW_BRANCH, assertBookingParticipantsPreviewEnvironment } from "../../scripts/consultation-preview-scope.mjs";
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

it("customer unified preview requires individual checkout opt-in and isolated connections", () => {
  const candidate={...env,VERCEL_GIT_COMMIT_REF:CUSTOMER_UNIFIED_DETAIL_PREVIEW_BRANCH,BOOKING_PARTICIPANTS_ENABLED:"true",CONSULTATION_PREVIEW_INTAKE_ENABLED:"false"};
  expect(()=>assertBookingParticipantsPreviewEnvironment(candidate)).not.toThrow();
  expect(assertReviewedReleaseEnvironment(candidate)).toBe("module-roster-preview");
  expect(()=>assertBookingParticipantsPreviewEnvironment({...candidate,BOOKING_PARTICIPANTS_ENABLED:"false"})).toThrow();
  expect(()=>assertBookingParticipantsPreviewEnvironment({...candidate,DIRECT_URL:"postgresql://postgres:synthetic@production.invalid/postgres"})).toThrow();
});
