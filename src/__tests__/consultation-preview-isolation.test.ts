import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertConsultationPreviewEnvironment,
  assertReviewedReleaseEnvironment,
  CONSULTATION_PREVIEW_BRANCH,
  isConsultationMockedUnitTest,
  isIsolatedConsultationDatabaseUrl,
} from "../../scripts/consultation-preview-scope.mjs";
import { SPORTS_SHARED_CARD_PREVIEW_BRANCH } from "../../scripts/sports-shared-card-preview-scope.mjs";

const direct = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const pool = "postgresql://postgres.ttworfzgwejdeolegkxl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
const valid = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: CONSULTATION_PREVIEW_BRANCH,
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  CONSULTATION_HQ_ENABLED: "true", CONSULTATION_PREVIEW_INTAKE_ENABLED: "true",
  DATABASE_URL: pool, DIRECT_URL: direct,
};
const invalidConnections = [
  undefined, "", "malformed", direct.replace("ttworfzgwejdeolegkxl", "another-project"),
  direct.replace("postgresql:", "https:"), direct.replace(".supabase.co", ".supabase.co.attacker.invalid"),
  direct.replace("postgres:synthetic", "other:synthetic"), direct.replace(":5432", ":6543"),
  direct.replace("/postgres", "/other"), direct.replace("/postgres", "/%70ostgres"),
  pool.replace("ttworfzgwejdeolegkxl", "another-project"), pool.replace("aws-0-", "aws-2-"),
  pool.replace("ap-northeast-1", "ap-southeast-1"), pool.replace(":6543", ":15432"),
  ...[
    "?host=remote.invalid", "?%68ost=remote.invalid", "?hostaddr=127.0.0.1", "?port=5433",
    "?user=other", "?password=other", "?dbname=other", "?database=other",
    "?options=-c%20search_path%3Dprivate", "?search_path=private", "?schema=private",
    "?schema=public&schema=public", "?schema=public&sch%65ma=public",
    "?sslmode=disable", "?sslaccept=accept_invalid_certs", "?pgbouncer=1",
    "?connection_limit=0", "?connection_limit=101", "?pool_timeout=-1", "?connect_timeout=301",
    "?socket_timeout=NaN", "?statement_cache_size=1001", "?connection_limit=01",
    "?unknown=value", "?__proto__=value", "#fragment",
  ].map(suffix => direct + suffix),
  "\n" + direct, direct.replace("db.", "db.\n"),
];

// Block construction and subprocess execution in every child, even if the
// tested guard regresses. Only synthetic configuration is ever supplied.
const tripwire = "CONSULTATION_TEST_DATABASE_OR_SUBPROCESS_ACCESS";
const prismaStub = `export class PrismaClient { constructor() { throw new Error(${JSON.stringify(tripwire)}); } }`;
const subprocessStub = `export function execFileSync() { throw new Error(${JSON.stringify(tripwire)}); }`;
const preload = `import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, nextResolve) {
  const source = specifier === "@prisma/client" ? ${JSON.stringify(prismaStub)} : specifier === "node:child_process" ? ${JSON.stringify(subprocessStub)} : null;
  if (source) return { url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true };
  return nextResolve(specifier, context);
} });`;

function run(overrides: Record<string, string | undefined> = {}) {
  const env = {
    ...process.env, ...valid, GUIDE_UI_PREVIEW: "", WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "",
    PRODUCTION_MIGRATION_TARGET: "unrelated-pending-migration", ...overrides,
  };
  const result = spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, "scripts/ci-migrate.mjs"], {
    env, encoding: "utf8", timeout: 10_000,
  });
  const output = result.stdout + result.stderr;
  expect(result.error).toBeUndefined();
  expect(output).not.toContain(tripwire);
  for (const value of [env.DATABASE_URL, env.DIRECT_URL]) if (value) expect(output).not.toContain(value);
  return { status: result.status, output };
}

describe("release-bound consultation Preview preflight", () => {
  it.each([[direct, direct], [pool, direct], [direct, pool], [pool, pool]])("accepts only isolated connections and skips every migration", (database, directUrl) => {
    expect(() => assertConsultationPreviewEnvironment({ ...valid, DATABASE_URL: database, DIRECT_URL: directUrl })).not.toThrow();
    const result = run({ DATABASE_URL: database, DIRECT_URL: directUrl });
    expect(result.status).toBe(0);
    expect(result.output).toContain("[consultation-preview-preflight] isolated_database=true notifications_blocked=true flags_enabled=true migrations_skipped=true");
    expect(result.output).not.toMatch(/recovery_|migration_deploy|migration_skipped_no_target/);
  });

  it("preserves the strict shared parser, including secure TLS and bounded non-routing options", () => {
    expect(isIsolatedConsultationDatabaseUrl(pool + "?schema=public&sslmode=require&sslaccept=strict&pgbouncer=true&connection_limit=1&pool_timeout=10&connect_timeout=10&socket_timeout=0&statement_cache_size=0")).toBe(true);
    expect(isIsolatedConsultationDatabaseUrl(direct + "?sslmode=verify-full")).toBe(true);
    expect(isIsolatedConsultationDatabaseUrl(direct + "?sslmode=verify-ca")).toBe(true);
    for (const connection of invalidConnections) expect(isIsolatedConsultationDatabaseUrl(connection)).toBe(false);
  });

  it.each(["DATABASE_URL", "DIRECT_URL"])("rejects unsafe %s before any migration or database work", (key) => {
    for (const value of invalidConnections) {
      expect(() => assertConsultationPreviewEnvironment({ ...valid, [key]: value })).toThrow("existing isolated database for both connections");
      const result = run({ [key]: value });
      expect(result.status).not.toBe(0);
      expect(result.output).toContain("existing isolated database for both connections");
      expect(result.output).not.toContain("migrations_skipped=true");
    }
  }, 30_000);

  it.each([undefined, "", "production", "development", "unknown"])("rejects non-Preview environment %s", (environment) => {
    expect(() => assertConsultationPreviewEnvironment({ ...valid, VERCEL_ENV: environment })).toThrow("VERCEL_ENV=preview");
    const result = run({ VERCEL_ENV: environment });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("VERCEL_ENV=preview");
  });

  it.each(["VERCEL_GIT_COMMIT_REF", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG"])("requires exact %s metadata", (key) => {
    for (const value of [undefined, "", "main", "wrong"]) {
      expect(() => assertConsultationPreviewEnvironment({ ...valid, [key]: value })).toThrow("exact authorized Preview branch and repository metadata");
      const result = run({ [key]: value });
      expect(result.status).not.toBe(0);
      expect(result.output).toContain("exact authorized Preview branch and repository metadata");
    }
  });

  it.each(["CONSULTATION_HQ_ENABLED", "CONSULTATION_PREVIEW_INTAKE_ENABLED"])("requires exact true for %s", (key) => {
    for (const value of [undefined, "", "false", "1", "TRUE"]) {
      expect(() => assertConsultationPreviewEnvironment({ ...valid, [key]: value })).toThrow("both existing opt-in flags");
      const result = run({ [key]: value });
      expect(result.status).not.toBe(0);
      expect(result.output).toContain("both existing opt-in flags");
    }
  });

  it.each(["WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"])("rejects conflicting consultation provider metadata in %s", (key) => {
    expect(() => assertConsultationPreviewEnvironment({ ...valid, [key]: "main" })).toThrow("exact authorized Preview branch and repository metadata");
    const result = run({ [key]: "main" });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("exact authorized Preview branch and repository metadata");
    expect(result.output).not.toContain("migrations_skipped=true");
  });

  it("limits the legacy test exception to nondeployed mocked Vitest workers", () => {
    const mocked = { NODE_ENV: "test", VITEST: "true", VITEST_WORKER_ID: "1" };
    expect(isConsultationMockedUnitTest(mocked)).toBe(true);
    for (const patch of [{ VERCEL: "1" }, { NODE_ENV: "production" }, { NODE_ENV: undefined }, { VITEST: undefined }, { VITEST: "1" }, { VITEST_WORKER_ID: undefined }, { VITEST_WORKER_ID: "" }]) {
      expect(isConsultationMockedUnitTest({ ...mocked, ...patch })).toBe(false);
    }
    const result = run({ ...mocked, VERCEL: "1", VERCEL_GIT_COMMIT_REF: undefined });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("exact authorized Preview branch and repository metadata");
  });

  it("preserves the exact no-database guide sandbox before the release dispatcher", () => {
    const result = run({
      GUIDE_UI_PREVIEW: "1", VERCEL_GIT_COMMIT_REF: "feat/public-guide-articles-20261007",
      DATABASE_URL: "postgresql://guide-ui:guide-ui@127.0.0.1:9/guide_ui_preview",
      DIRECT_URL: "postgresql://guide-ui:guide-ui@127.0.0.1:9/guide_ui_preview",
    });
    expect(result.status).toBe(0);
    expect(result.output).toContain("database_disabled=true migrations_skipped=true");
    expect(result.output).not.toContain("isolated_database=true");
  });

  it("keeps the build command and preflights before every migration and Next config path", () => {
    expect(JSON.parse(readFileSync("package.json", "utf8")).scripts.build).toBe("node scripts/ci-migrate.mjs && npm run generate:clients && next build");
    const source = readFileSync("scripts/ci-migrate.mjs", "utf8");
    const check = source.indexOf("assertReviewedReleaseEnvironment(process.env)");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(source.indexOf("execFileSync(\"npx\""));
    expect(check).toBeLessThan(source.indexOf("new PrismaClient("));
    expect(source.indexOf("process.exit(0)", check)).toBeLessThan(source.indexOf("execFileSync(\"npx\""));
    const config = readFileSync("next.config.ts", "utf8");
    expect(config.indexOf("isGuideUiPreview();")).toBeLessThan(config.indexOf("assertReviewedReleaseEnvironment(process.env)"));
    expect(config.indexOf("assertReviewedReleaseEnvironment(process.env)")).toBeLessThan(config.indexOf("const nextConfig:"));
  });
});

describe("composed consultation and shared-card release modes", () => {
  const production = {
    VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main",
    CONSULTATION_HQ_ENABLED: undefined, CONSULTATION_PREVIEW_INTAKE_ENABLED: undefined,
    PRODUCTION_MIGRATION_TARGET: undefined,
  };

  it("retains each exact Preview's own parser and feature requirements", () => {
    const consultation = { ...valid, DIRECT_URL: direct + "?sslmode=verify-full&sslaccept=strict" };
    expect(assertReviewedReleaseEnvironment(consultation)).toBe("consultation-preview");
    expect(run({ DIRECT_URL: consultation.DIRECT_URL }).status).toBe(0);
    const card = {
      ...valid, VERCEL_GIT_COMMIT_REF: SPORTS_SHARED_CARD_PREVIEW_BRANCH,
      CONSULTATION_HQ_ENABLED: undefined, CONSULTATION_PREVIEW_INTAKE_ENABLED: undefined,
    };
    expect(assertReviewedReleaseEnvironment(card)).toBe("sports-shared-card-preview");
    const result = run(card);
    expect(result.status).toBe(0);
    expect(result.output).toContain("[sports-shared-card-preview-preflight]");
    expect(result.output).toContain("recovery_skipped_outside_production");
    expect(result.output).not.toContain("[consultation-preview-preflight]");
  });

  it.each([undefined, "false", "true"])("allows verified production main without changing HQ rollout flag %s", (flag) => {
    const env = { ...valid, ...production, CONSULTATION_HQ_ENABLED: flag };
    expect(assertReviewedReleaseEnvironment(env)).toBe("production");
    expect(env.CONSULTATION_HQ_ENABLED).toBe(flag);
    expect(env.CONSULTATION_PREVIEW_INTAKE_ENABLED).toBeUndefined();
    const result = run({ ...production, CONSULTATION_HQ_ENABLED: flag });
    expect(result.status).toBe(0);
    expect(result.output).toContain("migration_skipped_no_target");
    expect(result.output).not.toContain("isolated_database=true");
  });

  it("rejects a leaked Preview-only intake flag before any production migration path", () => {
    const env = { ...valid, ...production, CONSULTATION_PREVIEW_INTAKE_ENABLED: "true" };
    expect(() => assertReviewedReleaseEnvironment(env)).toThrow("Preview intake flag must be disabled on production main");
    const result = run(env);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Preview intake flag must be disabled on production main");
    expect(result.output).not.toContain("migration_skipped_no_target");
  });

  it("keeps automatic deployment disabled for both exact Preview branches", () => {
    const enabled = JSON.parse(readFileSync("vercel.json", "utf8")).git.deploymentEnabled;
    expect(enabled[CONSULTATION_PREVIEW_BRANCH]).toBe(false);
    expect(enabled[SPORTS_SHARED_CARD_PREVIEW_BRANCH]).toBe(false);
    expect(enabled.main).not.toBe(false);
  });
});
