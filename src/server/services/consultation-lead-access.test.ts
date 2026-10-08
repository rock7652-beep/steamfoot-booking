import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consultationDatabaseAllowed, consultationPreviewIntakeEnabled } from "./consultation-lead-access";

const direct = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const pool = "postgresql://postgres.ttworfzgwejdeolegkxl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("DATABASE_URL", pool);
  vi.stubEnv("DIRECT_URL", direct);
});
afterEach(() => vi.unstubAllEnvs());

describe("strict consultation Preview database boundary", () => {
  it.each([
    direct,
    direct.replace("postgresql:", "postgres:"),
    direct.replace(":5432", ""),
    pool,
    pool.replace("aws-0-", "aws-1-"),
    pool.replace(":6543", ":5432"),
    pool.replace(":6543", ""),
    `${pool}?pgbouncer=true&connection_limit=1&pool_timeout=10&connect_timeout=10&schema=public&sslmode=require`,
    `${direct}?sslmode=verify-full&sslaccept=strict&socket_timeout=30&statement_cache_size=0`,
  ])("allows only supported isolated targets and routing-neutral parameters: %s", (url) => {
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("DIRECT_URL", url);
    expect(consultationDatabaseAllowed()).toBe(true);
  });

  it.each([
    undefined, "", "invalid",
    direct.replace("postgresql:", "https:"),
    direct.replace("ttworfzgwejdeolegkxl", "another-project"),
    direct.replace("db.ttworfzgwejdeolegkxl.supabase.co", "db.ttworfzgwejdeolegkxl.supabase.co.evil.invalid"),
    direct.replace("postgres:synthetic", "other:synthetic"),
    direct.replace("postgres:synthetic", "postgres.ttworfzgwejdeolegkxl:synthetic"),
    direct.replace(":5432", ":6543"),
    direct.replace("/postgres", "/other_database"),
    direct.replace("/postgres", "/%70ostgres"),
    direct.replace("/postgres", "/postgres/"),
    direct + "#fragment",
    pool.replace("postgres.ttworfzgwejdeolegkxl", "postgres.other-project"),
    pool.replace("postgres.ttworfzgwejdeolegkxl", "postgres"),
    pool.replace("ap-northeast-1", "ap-southeast-1"),
    pool.replace("aws-0-", "aws-2-"),
    pool.replace(".pooler.supabase.com", ".pooler.supabase.com.evil.invalid"),
    pool.replace(":6543", ":15432"),
    `${direct}?schema=private`,
    `${direct}?schema=public&schema=private`,
    `${direct}?schema=public&schema=public`,
    `${direct}?schema=public&sch%65ma=public`,
    `${direct}?host=production.invalid`,
    `${direct}?hostaddr=127.0.0.1`,
    `${direct}?port=5433`,
    `${direct}?user=other`,
    `${direct}?password=other`,
    `${direct}?dbname=production`,
    `${direct}?database=production`,
    `${direct}?options=-c%20search_path%3Dprivate`,
    `${direct}?search_path=private`,
    `${direct}?sslmode=disable`,
    `${direct}?sslaccept=accept_invalid_certs`,
    `${direct}?unknown=value`,
    `${direct}?__proto__=value`,
    `${direct}?pgbouncer=true&pgbouncer=false`,
    `${direct}?pgbouncer=1`,
    `${direct}?connect_timeout=NaN`,
    `${direct}?connection_limit=0`,
    `${direct}?pool_timeout=-1`,
    `${direct}?statement_cache_size=100000`,
    `${direct}?sslmode=require;host=production.invalid`,
    "\n" + direct,
    direct.replace("db.", "db.\n"),
  ])("denies any unsupported/ambiguous connection in either existing variable: %s", (url) => {
    vi.stubEnv("DATABASE_URL", url);
    expect(consultationDatabaseAllowed()).toBe(false);
    vi.stubEnv("DATABASE_URL", pool);
    vi.stubEnv("DIRECT_URL", url);
    expect(consultationDatabaseAllowed()).toBe(false);
  });

  it.each([undefined,"production","unknown"])("rejects Preview test flag outside explicit Preview: %s",(env)=>{
    vi.stubEnv("VERCEL_ENV",env);vi.stubEnv("CONSULTATION_PREVIEW_INTAKE_ENABLED","true");
    expect(consultationDatabaseAllowed()).toBe(false);
  });
  it("preserves the existing non-Preview guard behavior", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("DIRECT_URL", undefined);
    expect(consultationDatabaseAllowed()).toBe(true);
  });

  it.each([undefined, "false", "1", "TRUE"])("requires an exact opt-in flag: %s", (flag) => {
    vi.stubEnv("CONSULTATION_PREVIEW_INTAKE_ENABLED", flag);
    expect(consultationPreviewIntakeEnabled()).toBe(false);
  });

  it("enables the test intake only in Preview", () => {
    vi.stubEnv("CONSULTATION_PREVIEW_INTAKE_ENABLED", "true");
    expect(consultationPreviewIntakeEnabled()).toBe(true);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(consultationPreviewIntakeEnabled()).toBe(false);
  });
});
