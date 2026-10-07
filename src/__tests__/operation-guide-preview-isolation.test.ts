import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const branch = "docs/operation-guide-audit-20261004";
const direct = "postgresql://postgres:fixture@db.ttworfzgwejdeolegkxl.supabase.co/postgres";
const pooled = "postgresql://postgres.ttworfzgwejdeolegkxl:fixture@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
const unverified = "postgresql://postgres:fixture@unverified.invalid/postgres";
function run(database: string | undefined, directUrl: string | undefined, environment = "preview", ref = branch) {
  const env: NodeJS.ProcessEnv = { ...process.env, VERCEL_ENV: environment, VERCEL_GIT_COMMIT_REF: ref };
  for (const key of ["DATABASE_URL", "DIRECT_URL", "PRODUCTION_MIGRATION_TARGET"]) delete env[key];
  if (database !== undefined) env.DATABASE_URL = database;
  if (directUrl !== undefined) env.DIRECT_URL = directUrl;
  const result = spawnSync(process.execPath, ["scripts/ci-migrate.mjs"], { env, encoding: "utf8" });
  return { status: result.status, output: result.stdout + result.stderr };
}

describe("operation guide Preview database isolation", () => {
  it.each([[direct, direct], [pooled, direct], [pooled, pooled]])("accepts only the existing isolated target without connecting or migrating", (database, directUrl) => {
    const result = run(database, directUrl);
    expect(result.status).toBe(0);
    expect(result.output).toContain("[operation-guide-preview-preflight] isolated_database=true");
    expect(result.output).toContain("recovery_skipped_outside_production");
    expect(result.output).not.toContain(database);
    expect(result.output).not.toContain(directUrl);
  });
  it.each([
    [undefined, direct], [direct, undefined], ["", direct], [direct, "invalid"],
    [unverified, direct], [direct, unverified], [unverified, unverified],
  ])("fails closed before build queries when either connection is missing or unverified", (database, directUrl) => {
    const result = run(database, directUrl);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Operation guide Preview requires the existing isolated test database for both connections.");
    expect(result.output).not.toContain("recovery_skipped_outside_production");
    for (const value of [database, directUrl]) if (value) expect(result.output).not.toContain(value);
  });
  it("does not change unrelated preview branches", () => {
    const result = run(undefined, undefined, "preview", "unrelated-preview-fixture");
    expect(result.status).toBe(0);
    expect(result.output).not.toContain("operation-guide-preview-preflight");
  });
  it("covers all three business clients and schema direct connections", () => {
    for (const file of ["src/lib/database-url.ts", "src/lib/spa-db.ts", "src/lib/course-db.ts"]) {
      expect(readFileSync(file, "utf8")).toContain("process.env.DATABASE_URL");
    }
    for (const file of ["prisma/schema.prisma", "spa-prisma/schema.prisma", "course-prisma/schema.prisma"]) {
      expect(readFileSync(file, "utf8")).toContain('directUrl = env("DIRECT_URL")');
    }
  });
});
