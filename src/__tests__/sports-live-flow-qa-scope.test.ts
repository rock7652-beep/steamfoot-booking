import { afterEach, expect, it, vi } from "vitest";
import { assertReviewedReleaseEnvironment } from "../../scripts/consultation-preview-scope.mjs";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
afterEach(() => vi.unstubAllEnvs());
const local = {
  SPORTS_LIVE_FLOW_QA: "1", NODE_ENV: "development", NEXTAUTH_URL: "http://127.0.0.1:3107", AUTH_URL: "http://127.0.0.1:3107",
  DATABASE_URL: "postgresql://postgres@127.0.0.1:55438/sports_live_flow_test",
  DIRECT_URL: "postgresql://postgres@127.0.0.1:55438/sports_live_flow_test",
};
it("permits an explicit local QA process targeting only the disposable database", () => {
  expect(assertReviewedReleaseEnvironment(local)).toBe("local-sports-qa");
  expect(assertReviewedReleaseEnvironment({ ...local, AUTH_URL: "http://localhost:3107", NEXTAUTH_URL: "http://localhost:3107" })).toBe("local-sports-qa");
});
it.each(["VERCEL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG", "WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"])("rejects QA mode with deployment metadata %s", key => {
  expect(() => assertReviewedReleaseEnvironment({ ...local, [key]: "present" })).toThrow("local development");
});
it.each(["production", "test", ""])("rejects %s runtime", NODE_ENV => {
  expect(() => assertReviewedReleaseEnvironment({ ...local, NODE_ENV })).toThrow("local development");
});
it.each([
  "postgresql://postgres@remote.invalid:55438/sports_live_flow_test",
  "postgresql://postgres@127.0.0.1:5432/sports_live_flow_test",
  "postgresql://postgres@127.0.0.1:55438/production",
  "postgresql://postgres@127.0.0.1:55438/sports_live_flow_test?host=remote.invalid",
  "postgresql://postgres@127.0.0.1:55438/sports_live_flow_test?schema=other",
  "postgresql://postgres@127.0.0.1:55438/sports_live_flow_test#override",
])("rejects alternative connection targets for either client", connection => {
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) expect(() => assertReviewedReleaseEnvironment({ ...local, [key]: connection })).toThrow("dedicated loopback");
});
it("does not enable local development without the explicit QA switch", () => {
  expect(() => assertReviewedReleaseEnvironment({ ...local, SPORTS_LIVE_FLOW_QA: undefined })).toThrow();
});
it("keeps outbound integrations blocked in local QA", () => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("VERCEL", undefined); vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("SPORTS_LIVE_FLOW_QA", "1");
  expect(isPreviewExternalIntegrationBlocked()).toBe(true);
});
it("rejects a mismatched auth origin", () => {
  expect(() => assertReviewedReleaseEnvironment({ ...local, AUTH_URL: "https://remote.invalid" })).toThrow("local development");
});
