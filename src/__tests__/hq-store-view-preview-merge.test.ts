import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const branch = "feat/hq-store-real-view-20261007";
const isolated = "postgresql://postgres:fixture@db.ttworfzgwejdeolegkxl.supabase.co/postgres";
const unverified = "postgresql://postgres:fixture@unverified.invalid/postgres";

function run(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of ["DATABASE_URL", "DIRECT_URL", "PRODUCTION_MIGRATION_TARGET", "GUIDE_UI_PREVIEW", "WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"])
    delete env[key];
  Object.assign(env, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: branch, DATABASE_URL: isolated, DIRECT_URL: isolated }, overrides);
  const result = spawnSync(process.execPath, ["scripts/ci-migrate.mjs"], { env, encoding: "utf8", timeout: 15000 });
  return { status: result.status, output: result.stdout + result.stderr };
}

describe("HQ Preview isolation after merging public guide guards", () => {
  it("accepts the existing isolated HQ target without migrating or enabling guide-only mode", () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.output).toContain("recovery_skipped_outside_production");
    expect(result.output).not.toMatch(/migration_deploy_started|recovery_preflight_started|database_disabled=true/);
    expect(result.output).not.toContain(isolated);
  });

  it.each([
    { DATABASE_URL: undefined }, { DIRECT_URL: undefined },
    { DATABASE_URL: unverified }, { DIRECT_URL: unverified },
  ])("rejects incomplete or non-isolated HQ connections before database work", overrides => {
    const result = run(overrides);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("HQ store-view Preview requires isolated database overrides for both connections.");
    expect(result.output).not.toMatch(/migration_deploy_started|recovery_preflight_started|recovery_skipped_outside_production/);
    expect(result.output).not.toContain(unverified);
  });

  it.each(["VERCEL_GIT_COMMIT_REF", "WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"])("preserves the SEO branch deployment block via %s", key => {
    const result = run({ [key]: "fix/public-seo-crawlers-20261007" });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("SEO review branch deployment is disabled; use local verification.");
    expect(result.output).not.toContain("recovery_skipped_outside_production");
  });

  it("does not let the guide-only flag bypass the HQ branch boundary", () => {
    const result = run({ GUIDE_UI_PREVIEW: "1" });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("isolation rejected");
    expect(result.output).not.toContain("database_disabled=true");
  });
});
