import { describe, it, expect } from "vitest";
import { assertImageAnnouncementsAcceptance, IMAGE_ACCEPTANCE_DATABASE, IMAGE_ACCEPTANCE_ORIGIN } from "../../scripts/image-announcements-acceptance-scope.mjs";
import { assertReviewedReleaseEnvironment } from "../../scripts/consultation-preview-scope.mjs";
const env = { IMAGE_ANNOUNCEMENTS_ACCEPTANCE: "1", NODE_ENV: "development", DATABASE_URL: IMAGE_ACCEPTANCE_DATABASE, DIRECT_URL: IMAGE_ACCEPTANCE_DATABASE, AUTH_URL: IMAGE_ACCEPTANCE_ORIGIN, NEXTAUTH_URL: IMAGE_ACCEPTANCE_ORIGIN };
describe("isolated live image announcement acceptance", () => {
  it("accepts only explicit loopback development and dedicated database", () => {
    expect(() => assertImageAnnouncementsAcceptance(env)).not.toThrow();
    expect(assertReviewedReleaseEnvironment(env)).toBe("local-image-announcements-qa");
  });
  it("allows a credential-free local production build only with an explicit build flag", () => {
    expect(() => assertImageAnnouncementsAcceptance({ ...env, NODE_ENV: "production", IMAGE_ANNOUNCEMENTS_ACCEPTANCE_BUILD: "1" })).not.toThrow();
    expect(() => assertImageAnnouncementsAcceptance({ ...env, NODE_ENV: "production", IMAGE_ANNOUNCEMENTS_ACCEPTANCE_BUILD: "1", VERCEL_ENV: "production" })).toThrow();
  });
  it("rejects remote or altered database and auth origins", () => {
    for (const patch of [{ DATABASE_URL: "postgresql://postgres@remote.invalid/db" }, { DIRECT_URL: IMAGE_ACCEPTANCE_DATABASE + "?host=remote.invalid" }, { AUTH_URL: "https://example.invalid" }, { NODE_ENV: "production" }, { IMAGE_ANNOUNCEMENTS_ACCEPTANCE: "" }]) expect(() => assertImageAnnouncementsAcceptance({ ...env, ...patch })).toThrow();
  });
  it("never accepts deployment metadata, including a production main deployment", () => {
    for (const key of ["VERCEL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"]) expect(() => assertImageAnnouncementsAcceptance({ ...env, [key]: "main" })).toThrow();
    expect(() => assertReviewedReleaseEnvironment({ ...env, VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" })).toThrow();
  });
});
