import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureSpaPreviewPool } from "@/lib/spa-preview-pool";
import { buildDatabaseUrl } from "@/lib/database-url";
const testUrl =
  "postgresql://postgres.ttworfzgwejdeolegkxl:test-password@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require";
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "codex/hq-module-foundation");
});
afterEach(() => vi.unstubAllEnvs());
describe("isolated SPA Preview pool repair", () => {
  it("switches only the verified endpoint to transaction mode and preserves credentials and TLS", () => {
    const url = new URL(testUrl);
    expect(configureSpaPreviewPool(url)).toBe(true);
    expect(url.port).toBe("6543");
    expect(url.password).toBe("test-password");
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.searchParams.get("pgbouncer")).toBe("true");
    expect(url.searchParams.get("connection_limit")).toBe("1");
  });
  it.each(["production", "development"])(
    "does not change %s connections",
    (environment) => {
      vi.stubEnv("VERCEL_ENV", environment);
      const url = new URL(testUrl);
      const original = url.toString();
      expect(configureSpaPreviewPool(url)).toBe(false);
      expect(url.toString()).toBe(original);
    },
  );
  it.each([
    testUrl.replace("ttworfzgwejdeolegkxl", "qijlnhtpbintanzpxkvf"),
    testUrl.replace(
      "aws-1-ap-northeast-1.pooler.supabase.com",
      "another.example.com",
    ),
    testUrl.replace(":5432/", ":5433/"),
    "postgresql://postgres:test@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",
  ])("does not rewrite unapproved endpoints", (base) => {
    const url = new URL(base);
    const original = url.toString();
    expect(configureSpaPreviewPool(url)).toBe(false);
    expect(url.toString()).toBe(original);
  });
  it("does not change another branch", () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "other");
    const url = new URL(testUrl);
    expect(configureSpaPreviewPool(url)).toBe(false);
    expect(url.port).toBe("5432");
  });
  it.each([
    ["production", "codex/hq-module-foundation"],
    ["development", "codex/hq-module-foundation"],
    ["preview", "other"],
  ])("keeps the shared runtime endpoint unchanged for %s / %s", (environment, branch) => {
    vi.stubEnv("VERCEL_ENV", environment);
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", branch);
    vi.stubEnv("DATABASE_URL", testUrl + "&connection_limit=7");
    vi.stubEnv("DIRECT_URL", testUrl);
    const actual = new URL(buildDatabaseUrl());
    const original = new URL(testUrl);
    for (const field of ["hostname", "port", "username", "password", "pathname"] as const) {
      expect(actual[field]).toBe(original[field]);
    }
    expect(actual.searchParams.get("connection_limit")).toBe("7");
    expect(actual.searchParams.get("sslmode")).toBe("require");
    expect(process.env.DIRECT_URL).toBe(testUrl);
  });
  it("applies to the main runtime client without changing DIRECT_URL", () => {
    vi.stubEnv("DATABASE_URL", testUrl);
    vi.stubEnv("DIRECT_URL", testUrl);
    expect(new URL(buildDatabaseUrl()).port).toBe("6543");
    expect(process.env.DIRECT_URL).toBe(testUrl);
  });
});
