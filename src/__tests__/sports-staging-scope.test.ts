import { afterEach, describe, expect, it, vi } from "vitest";
import {
  sportsStagingEnabled,
  requireSportsStaging,
} from "@/lib/sports-staging";
afterEach(() => vi.unstubAllEnvs());
function isolated() {
  for (const key of [
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_GIT_COMMIT_REF",
    "VERCEL_GIT_REPO_OWNER",
    "VERCEL_GIT_REPO_SLUG",
    "WORKERS_CI_BRANCH",
    "CF_PAGES_BRANCH",
  ])
    vi.stubEnv(key, undefined);
  for (const [key, value] of Object.entries({
    SPORTS_REDESIGN_STAGING: "1",
    SPORTS_LIVE_FLOW_QA: "1",
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://postgres@127.0.0.1:55438/sports_live_flow_test",
    DIRECT_URL: "postgresql://postgres@127.0.0.1:55438/sports_live_flow_test",
    AUTH_URL: "http://localhost:3107",
    NEXTAUTH_URL: "http://localhost:3107",
  }))
    vi.stubEnv(key, value);
}
describe("sports redesign isolation boundary", () => {
  it("is disabled without explicit opt-in", () => {
    vi.stubEnv("SPORTS_REDESIGN_STAGING", undefined);
    expect(sportsStagingEnabled()).toBe(false);
    expect(() => requireSportsStaging()).toThrow();
  });
  it("accepts only the disposable local development station", () => {
    isolated();
    expect(sportsStagingEnabled()).toBe(true);
  });
  it.each(["production", "test"])("rejects NODE_ENV=%s", (value) => {
    isolated();
    vi.stubEnv("NODE_ENV", value);
    expect(() => sportsStagingEnabled()).toThrow();
  });
  it.each(["VERCEL", "VERCEL_ENV", "CF_PAGES_BRANCH", "WORKERS_CI_BRANCH"])(
    "rejects deployment metadata %s",
    (key) => {
      isolated();
      vi.stubEnv(key, "production");
      expect(() => sportsStagingEnabled()).toThrow();
    },
  );
  it.each(["DATABASE_URL", "DIRECT_URL"])("rejects a remote %s", (key) => {
    isolated();
    vi.stubEnv(key, "postgresql://postgres@db.example.invalid/production");
    expect(() => sportsStagingEnabled()).toThrow();
  });
});
