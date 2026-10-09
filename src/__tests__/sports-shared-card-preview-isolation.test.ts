import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertSportsSharedCardPreviewEnvironment,
  isSportsSharedCardIsolatedConnection,
  isSportsSharedCardMockedUnitTest,
  SPORTS_SHARED_CARD_PREVIEW_BRANCH,
  isSportsSharedCardProductionRelease,
} from "../../scripts/sports-shared-card-preview-scope.mjs";

const direct = "postgresql://postgres:fixture@db.ttworfzgwejdeolegkxl.supabase.co/postgres";
const pooled = "postgresql://postgres.ttworfzgwejdeolegkxl:fixture@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
const production = "postgresql://postgres:fixture@db.qijlnhtpbintanzpxkvf.supabase.co/postgres";
const valid = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: SPORTS_SHARED_CARD_PREVIEW_BRANCH, VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking", DATABASE_URL: pooled, DIRECT_URL: direct };
const invalidConnections = [
  undefined, "", "invalid", production,
  pooled.replace("ttworfzgwejdeolegkxl", "qijlnhtpbintanzpxkvf"),
  direct.replace("postgresql:", "https:"),
  direct.replace(".supabase.co", ".supabase.co.attacker.invalid"),
  pooled.replace("aws-0-ap-northeast-1.pooler.supabase.com", "unverified.invalid"),
  direct.replace("/postgres", "/other"),
  direct.replace("postgres:fixture", "other:fixture"),
  direct.replace(".co/postgres", ".co:6543/postgres"),
  pooled.replace(":6543/", ":5433/"),
  ...[
    "?host=db.qijlnhtpbintanzpxkvf.supabase.co", "?hostaddr=127.0.0.1", "?%68ost=unverified.invalid",
    "?options=-csearch_path=other", "?schema=other", "?schema=public&schema=other", "?schema=public&schema=public",
    "?schema=public&%73chema=public", "?connection_limit=1&connection_limit=2", "?unknown=1", "#ignored",
    "?pgbouncer=unverified", "?sslmode=unknown", "?connection_limit=0", "?connect_timeout=other",
  ].map(suffix => direct + suffix),
];

// Every child process replaces Prisma construction and subprocess execution
// with tripwires. A regression can fail this test, but cannot access any DB.
const tripwire = "SHARED_CARD_TEST_DATABASE_OR_SUBPROCESS_ACCESS";
const prismaStub = `export class PrismaClient { constructor() { throw new Error(${JSON.stringify(tripwire)}); } }`;
const childProcessStub = `export function execFileSync() { throw new Error(${JSON.stringify(tripwire)}); }`;
const preload = `import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, nextResolve) {
  const source = specifier === "@prisma/client" ? ${JSON.stringify(prismaStub)} : specifier === "node:child_process" ? ${JSON.stringify(childProcessStub)} : null;
  if (source) return { url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true };
  return nextResolve(specifier, context);
} });`;

function run(overrides: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = { ...process.env, ...valid, ...overrides };
  delete env.PRODUCTION_MIGRATION_TARGET;
  const result = spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, "scripts/ci-migrate.mjs"], { env, encoding: "utf8", timeout: 10000 });
  const output = result.stdout + result.stderr;
  expect(result.error).toBeUndefined();
  expect(output).not.toContain(tripwire);
  for (const value of [env.DATABASE_URL, env.DIRECT_URL]) if (value) expect(output).not.toContain(value);
  return { status: result.status, output };
}

describe("sports shared-card Preview preflight", () => {
  it("accepts only known single-valued Prisma connection options and the public schema", () => {
    for (const connection of [direct, pooled]) {
      expect(isSportsSharedCardIsolatedConnection(connection + "?pgbouncer=true&sslmode=require&connection_limit=1&pool_timeout=10&connect_timeout=10&socket_timeout=0&statement_cache_size=0&schema=public")).toBe(true);
    }
    for (const connection of invalidConnections) expect(isSportsSharedCardIsolatedConnection(connection)).toBe(false);
  });
  it.each([[direct, direct], [pooled, direct], [direct, pooled], [pooled, pooled]])("accepts both isolated connection forms without DB access", (database, directUrl) => {
    expect(() => assertSportsSharedCardPreviewEnvironment({ ...valid, DATABASE_URL: database, DIRECT_URL: directUrl })).not.toThrow();
    const result = run({ DATABASE_URL: database, DIRECT_URL: directUrl });
    expect(result.status).toBe(0);
    expect(result.output).toContain("[sports-shared-card-preview-preflight] isolated_database=true; notifications_blocked=true; environment=preview");
    expect(result.output).toContain("recovery_skipped_outside_production");
  });

  // These table cases spawn an isolated Node process for every hostile URL.
  // Allow process startup contention while retaining each child's 10s deadline.
  it.each(["DATABASE_URL", "DIRECT_URL"])("rejects every missing, malformed, production or spoofed %s before DB work", (key) => {
    for (const value of invalidConnections) {
      const env = { ...valid, [key]: value };
      expect(() => assertSportsSharedCardPreviewEnvironment(env)).toThrow("existing isolated database for both connections");
      const result = run({ [key]: value });
      expect(result.status).not.toBe(0);
      expect(result.output).toContain("existing isolated database for both connections");
      expect(result.output).not.toContain("recovery_skipped_outside_production");
    }
  }, 30_000);

  it.each([undefined, "", "production", "development"])("rejects the branch in a non-Preview target (%s), even with isolated URLs", (environment) => {
    const env = { ...valid, VERCEL_ENV: environment };
    expect(() => assertSportsSharedCardPreviewEnvironment(env)).toThrow("VERCEL_ENV=preview with outbound notifications blocked");
    const result = run({ VERCEL_ENV: environment });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("VERCEL_ENV=preview with outbound notifications blocked");
    expect(result.output).not.toContain("migration_skipped_no_target");
  });

  it.each(["VERCEL_GIT_COMMIT_REF", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG"])("rejects missing or changed %s for this temporary Preview-only checkout", (key) => {
    for (const value of [undefined, "", "main", "wrong"]) {
      const env = { ...valid, [key]: value };
      expect(() => assertSportsSharedCardPreviewEnvironment(env)).toThrow("exact authorized Preview branch and repository metadata");
      const result = run({ [key]: value });
      expect(result.status).not.toBe(0);
      expect(result.output).toContain("exact authorized Preview branch and repository metadata");
      expect(result.output).not.toContain("isolated_database=true");
    }
  });

  it("allows only clearly mocked non-deployed Vitest execution to skip runtime preflight", () => {
    const mocked = { NODE_ENV: "test", VITEST: "true", VITEST_WORKER_ID: "1" };
    expect(isSportsSharedCardMockedUnitTest(mocked)).toBe(true);
    for (const patch of [{ VERCEL: "1" }, { NODE_ENV: "production" }, { VITEST: undefined }, { VITEST_WORKER_ID: undefined }]) {
      expect(isSportsSharedCardMockedUnitTest({ ...mocked, ...patch })).toBe(false);
    }
    const result = run({ ...mocked, VERCEL: "1", VERCEL_GIT_COMMIT_REF: undefined });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("exact authorized Preview branch and repository metadata");
  });

  it("keeps the build chain intact and places preflight before all migration bodies", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
    expect(scripts.build).toBe("node scripts/ci-migrate.mjs && npm run generate:clients && next build");
    const source = readFileSync("scripts/ci-migrate.mjs", "utf8");
    const preflight = source.indexOf("assertReviewedReleaseEnvironment(process.env)");
    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(source.indexOf("execFileSync(\"npx\""));
    expect(preflight).toBeLessThan(source.indexOf("new PrismaClient("));
    expect(readFileSync("next.config.ts", "utf8")).toContain("assertReviewedReleaseEnvironment(process.env)");
  });
});


describe("reviewed production main migration boundary", () => {
  it("allows the exact production main build but preserves migration target gating", () => {
    const release = { ...valid, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", DATABASE_URL: production, DIRECT_URL: production };
    expect(isSportsSharedCardProductionRelease(release)).toBe(true);
    const result = run(release);
    expect(result.status).toBe(0);
    expect(result.output).toContain("migration_skipped_no_target");
    expect(result.output).not.toContain("isolated_database=true");
  });
  it.each(["WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"])("rejects conflicting provider provenance via %s", (key) => {
    expect(isSportsSharedCardProductionRelease({ ...valid, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", [key]: SPORTS_SHARED_CARD_PREVIEW_BRANCH })).toBe(false);
    const result = run({ [key]: SPORTS_SHARED_CARD_PREVIEW_BRANCH });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("exact authorized Preview branch and repository metadata");
  });
});
