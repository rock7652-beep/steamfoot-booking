import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { isGuideUiPreview, isHqUsageUiPreview, HQ_USAGE_UI_PREVIEW_BRANCH } from "../../scripts/guide-ui-preview-scope.mjs";
vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  Object.defineProperty(globalThis, "AsyncLocalStorage", { value: AsyncLocalStorage, configurable: true, writable: true });
});
const spies = vi.hoisted(() => ({ auth: vi.fn(), prisma: vi.fn(), spa: vi.fn(), course: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: (handler: (...args: unknown[]) => unknown) => (...args: unknown[]) => { spies.auth(); return handler(...args); } }));
vi.mock("@prisma/client", () => ({ PrismaClient: class { constructor() { spies.prisma(); } } }));
vi.mock("../../generated/spa-client", () => ({ PrismaClient: class { constructor() { spies.spa(); } } }));
vi.mock("../../generated/course-client", () => ({ PrismaClient: class { constructor() { spies.course(); } } }));
vi.mock("@/lib/audit-db-context", () => ({ withAuditDatabaseContext: (client: unknown) => client }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("resend", () => ({ Resend: class { emails = { send: spies.send }; } }));
import { proxy } from "@/proxy";
const safe = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: HQ_USAGE_UI_PREVIEW_BRANCH, VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking", WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "" };
const globals = globalThis as unknown as Record<string, unknown>;
const cache = { prisma: globals.prisma, spaPrisma: globals.spaPrisma, coursePrisma: globals.coursePrisma };
function enable() {
  for (const [key, value] of Object.entries(safe)) vi.stubEnv(key, value);
  // No live connection is necessary or allowed, regardless of inherited values.
  vi.stubEnv("DATABASE_URL", "postgresql://synthetic:synthetic@production.invalid/db");
  vi.stubEnv("DIRECT_URL", "postgresql://synthetic:synthetic@production.invalid/db");
}
function route(path: string, method = "GET") {
  return (proxy as unknown as (req: NextRequest) => Response)(new NextRequest(`https://hq-preview.invalid${path}`, { method }));
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); Object.assign(globals, cache); });
describe("exact HQ usage UI-only preview", () => {
  it("activates database-disabled mode only on its exact Vercel Preview provenance", () => {
    expect(isHqUsageUiPreview(safe)).toBe(true);
    expect(isGuideUiPreview(safe)).toBe(true);
    expect(isHqUsageUiPreview({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" })).toBe(false);
    expect(isHqUsageUiPreview({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "another-branch" })).toBe(false);
  });
  it.each(["VERCEL", "VERCEL_ENV", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG"])("rejects missing %s", key => {
    expect(() => isHqUsageUiPreview({ ...safe, [key]: undefined })).toThrow(/isolation rejected/);
  });
  it.each([["VERCEL_ENV", "production"], ["VERCEL_GIT_REPO_OWNER", "other"], ["VERCEL_GIT_REPO_SLUG", "other"], ["WORKERS_CI_BRANCH", "main"], ["CF_PAGES_BRANCH", HQ_USAGE_UI_PREVIEW_BRANCH]])("rejects conflicting %s", (key, value) => {
    expect(() => isHqUsageUiPreview({ ...safe, [key]: value })).toThrow(/isolation rejected/);
  });
  it.each(["/hq-usage-preview", "/hq-usage-preview?frame=1", "/_next/static/chunks/test.js"])("serves only read-only form/guide asset %s before auth", path => {
    enable();
    for (const method of ["GET", "HEAD"]) {
      const response = route(path, method);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
    expect(spies.auth).not.toHaveBeenCalled();
  });
  it.each(["/api/trial-applications", "/api/auth/session", "/api/cron/reminders", "/api/line/webhook", "/hq/login", "/hq/dashboard/trial-applications", "/apply", "/pricing/submit", "/guides", "/_next/image?url=https://remote.invalid/a.png", "/pricing/trial/guide/unknown", "/pricing/trial-guides/developers-roles.webp"])("blocks %s before any app handler", path => {
    enable();
    expect(route(path).status).toBe(404);
    expect(spies.auth).not.toHaveBeenCalled();
  });
  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("blocks every %s including Server Actions and submissions", method => {
    enable();
    for (const path of ["/hq-usage-preview", "/api/trial-applications", "/_next/static/test.js"]) expect(route(path, method).status).toBe(405);
    expect(spies.auth).not.toHaveBeenCalled();
  });
  it("skips migrations before creating clients or querying a database", () => {
    const result = spawnSync(process.execPath, ["scripts/ci-migrate.mjs"], { env: { ...process.env, ...safe, DATABASE_URL: "postgresql://synthetic:synthetic@production.invalid/db", DIRECT_URL: "postgresql://synthetic:synthetic@production.invalid/db", PRODUCTION_MIGRATION_TARGET: "unapproved-target" }, encoding: "utf8", timeout: 15000 });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("database_disabled=true migrations_skipped=true");
    expect(result.stdout).not.toContain("recovery_preflight_started");
  });
  it("never constructs or reuses real clients despite inherited project configuration", async () => {
    enable(); vi.resetModules();
    const cached = { connected: true };
    globals.prisma = cached; globals.spaPrisma = cached; globals.coursePrisma = cached;
    const clients = [(await import("@/lib/db")).prisma, (await import("@/lib/spa-db")).spaPrisma, (await import("@/lib/course-db")).coursePrisma];
    for (const client of clients) {
      expect(Object.is(client, cached)).toBe(false);
      for (const key of ["$connect", "$transaction", "$queryRaw", "$executeRaw", "trialApplication", "user"]) expect(() => Reflect.get(client, key)).toThrow("no database access");
    }
    for (const spy of [spies.prisma, spies.spa, spies.course]) expect(spy).not.toHaveBeenCalled();
  });
  it("never sends trial notifications even if transport settings exist", async () => {
    enable();
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("RESEND_API_KEY", "synthetic-only-key");
    const { notifyTrialApplication } = await import("@/server/services/trial-application-notification");
    expect(await notifyTrialApplication("synthetic")).toBe("DISABLED");
    expect(fetchMock).not.toHaveBeenCalled(); expect(spies.send).not.toHaveBeenCalled();
  });
  it.each(["GET", "HEAD", "POST"])("blocks production synthetic %s requests before authentication", method => {
    vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    vi.stubEnv("WORKERS_CI_BRANCH", ""); vi.stubEnv("CF_PAGES_BRANCH", "");
    expect(route("/hq-usage-preview", method).status).toBe(404);
    expect(route("/hq-usage-preview?frame=1", method).status).toBe(404);
    expect(spies.auth).not.toHaveBeenCalled();
  });
  it("keeps production main on its existing release mode and hides the synthetic route", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    vi.stubEnv("WORKERS_CI_BRANCH", ""); vi.stubEnv("CF_PAGES_BRANCH", "");
    const { default: page } = await import("@/app/hq-usage-preview/page");
    await expect(page({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
