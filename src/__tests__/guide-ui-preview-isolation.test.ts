import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { GUIDE_UI_PREVIEW_BRANCH, GUIDE_UI_PREVIEW_DATABASE_URL, isGuideUiPreview } from "../../scripts/guide-ui-preview-scope.mjs";

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
import { config, proxy } from "@/proxy";

const safe = {
  GUIDE_UI_PREVIEW: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: GUIDE_UI_PREVIEW_BRANCH,
  DATABASE_URL: GUIDE_UI_PREVIEW_DATABASE_URL, DIRECT_URL: GUIDE_UI_PREVIEW_DATABASE_URL,
};
const normalGlobals = globalThis as unknown as Record<string, unknown>;
const priorCache = { prisma: normalGlobals.prisma, spaPrisma: normalGlobals.spaPrisma, coursePrisma: normalGlobals.coursePrisma };
function enable() {
  for (const [key, value] of Object.entries(safe)) vi.stubEnv(key, value);
  vi.stubEnv("WORKERS_CI_BRANCH", ""); vi.stubEnv("CF_PAGES_BRANCH", "");
}
function route(path: string, method = "GET") {
  const req = new NextRequest(`https://preview.example.test${path}`, { method, headers: { host: "preview.example.test" } });
  Object.assign(req, { auth: null });
  return (proxy as unknown as (req: NextRequest) => Response)(req);
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); Object.assign(normalGlobals, priorCache); });

describe("exact guide UI preview scope", () => {
  it("accepts only the complete approved tuple and preserves ordinary environments", () => {
    expect(isGuideUiPreview(safe)).toBe(true);
    expect(isGuideUiPreview({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" })).toBe(false);
    expect(isGuideUiPreview({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "another-branch" })).toBe(false);
  });
  it.each(Object.keys(safe))("fails closed when %s is missing", key => {
    expect(() => isGuideUiPreview({ ...safe, [key]: undefined })).toThrow(/isolation rejected/);
  });
  it.each([
    ["VERCEL_ENV", "production"], ["VERCEL_GIT_COMMIT_REF", "main"], ["GUIDE_UI_PREVIEW", "true"],
    ["WORKERS_CI_BRANCH", GUIDE_UI_PREVIEW_BRANCH], ["CF_PAGES_BRANCH", "main"],
    ["DATABASE_URL", `${GUIDE_UI_PREVIEW_DATABASE_URL}?host=remote.invalid`],
    ["DIRECT_URL", `${GUIDE_UI_PREVIEW_DATABASE_URL}?options=-c%20search_path%3Dprivate`],
    ["DATABASE_URL", "postgresql://example:example@db.example.invalid:5432/app"],
  ])("rejects unsafe %s override", (key, value) => expect(() => isGuideUiPreview({ ...safe, [key]: value })).toThrow(/isolation rejected/));
  it.each(["VERCEL_GIT_COMMIT_REF", "WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"])("keeps unapproved branch deployment blocked via %s", key => {
    expect(() => isGuideUiPreview({ [key]: GUIDE_UI_PREVIEW_BRANCH })).toThrow(/isolation rejected/);
  });
  it.each(["/api/cron/send", "/api/cron-prefix", "/api/line/webhook", "/api/line/webhook-extra", "/_next/static/a.js", "/_next/staticsuffix", "/_next/image?url=a", "/favicon.ico", "/favicon.ico.extra", "/robots.txt", "/sitemap.xml"])("preserves normal auth-free exclusion %s", path => {
    vi.stubEnv("GUIDE_UI_PREVIEW", ""); vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    vi.stubEnv("WORKERS_CI_BRANCH", ""); vi.stubEnv("CF_PAGES_BRANCH", "");
    expect(route(path).headers.get("x-middleware-next")).toBe("1");
    expect(spies.auth).not.toHaveBeenCalled();
  });
  it("skips migrations in an actual node process before any database work", () => {
    const result = spawnSync(process.execPath, ["scripts/ci-migrate.mjs"], { env: { ...process.env, ...safe, WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "" }, encoding: "utf8", timeout: 15000 });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("database_disabled=true migrations_skipped=true");
    expect(result.stdout).not.toMatch(/migration_deploy_started|recovery_preflight_started/);
  });
});

describe("outer request boundary before auth", () => {
  beforeEach(enable);
  it.each(["/guides", "/guides/solo-store", "/guides/music-school-leave-makeup-lesson-balance", "/pricing/guides", "/pricing/guides/solo-store", "/robots.txt", "/sitemap.xml", "/pricing/brand/steam-butler-logo.png", "/_next/static/chunks/test.js", "/favicon.ico"])("permits only read-only editorial request %s", path => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path })).toBe(true);
    const response = route(path);
    expect([200, 308]).toContain(response.status);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(spies.auth).not.toHaveBeenCalled();
  });
  it.each(["/api/cron/send-reminders", "/api/line/webhook", "/api/auth/session", "/api/auth/callback/line", "/hq/login", "/s/zhubei/", "/s/zhubei/admin/dashboard", "/_next/image?url=https://remote.invalid/a.png&w=640&q=75", "/health", "/apply", "/guides/unknown", "/guides/private/admin", "/guides/%2f..%2fapi/cron/send", "/guides/UPPERCASE", "/pricing/guides/../submit", "/pricing/brand/not-a-guide.html"])("blocks %s before auth or route dispatch", path => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path })).toBe(true);
    expect(route(path).status).toBe(404);
    expect(spies.auth).not.toHaveBeenCalled();
  });
  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("rejects %s on pages, assets and APIs", method => {
    for (const path of ["/guides", "/_next/static/chunks/test.js", "/api/line/webhook", "/robots.txt"]) expect(route(path, method).status).toBe(405);
    expect(spies.auth).not.toHaveBeenCalled();
  });
  it("preserves legacy query redirect, HEAD, and draft preview without auth", () => {
    const response = route("/guides?guide=solo-store&token=discard");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://preview.example.test/guides/solo-store");
    expect(route("/guides/solo-store", "HEAD").status).toBe(200);
    expect(spies.auth).not.toHaveBeenCalled();
  });
  it("does not fall through to auth when runtime configuration loses isolation", () => {
    vi.stubEnv("DIRECT_URL", "postgresql://invalid.invalid/db");
    expect(() => route("/api/auth/session")).toThrow(/isolation rejected/);
    expect(spies.auth).not.toHaveBeenCalled();
  });
  it("disables config-level external redirects only in isolated mode", async () => {
    const { default: nextConfig } = await import("../../next.config");
    expect(await nextConfig.redirects!()).toEqual([]);
    vi.stubEnv("GUIDE_UI_PREVIEW", ""); vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main"); vi.stubEnv("VERCEL_ENV", "production");
    expect((await nextConfig.redirects!()).length).toBeGreaterThan(0);
  });
});

describe("database and outbound isolation", () => {
  beforeEach(enable);
  it("never constructs or reuses any real cached client", async () => {
    vi.resetModules();
    const cached = { connected: true };
    normalGlobals.prisma = cached; normalGlobals.spaPrisma = cached; normalGlobals.coursePrisma = cached;
    const clients = [(await import("@/lib/db")).prisma, (await import("@/lib/spa-db")).spaPrisma, (await import("@/lib/course-db")).coursePrisma];
    for (const client of clients) {
      expect(client === cached).toBe(false);
      for (const key of ["$connect", "$transaction", "$queryRaw", "$executeRaw", "user", "booking"])
        expect(() => Reflect.get(client, key)).toThrow("no database access");
    }
    for (const spy of [spies.prisma, spies.spa, spies.course]) expect(spy).not.toHaveBeenCalled();
    expect(normalGlobals.prisma).toBe(cached);
  });
  it("blocks actual LINE, Messenger, email and HealthFlow sender calls before network", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("STEAM_BUTLER_LINE_CHANNEL_ACCESS_TOKEN", "synthetic-only-token");
    vi.stubEnv("RESEND_API_KEY", "synthetic-only-key");
    const { pushSteamButlerMessage } = await import("@/lib/line");
    const { sendMessengerMessages } = await import("@/lib/messenger");
    const { sendPasswordResetEmail } = await import("@/lib/email");
    const { lookupHealthProfile } = await import("@/lib/health-service");
    await expect(pushSteamButlerMessage("synthetic-recipient", [{ type: "text", text: "test" }])).resolves.toMatchObject({ success: false, errorType: "preview_blocked" });
    await expect(sendMessengerMessages({ pageId: "synthetic", pageAccessToken: "synthetic", recipientId: "synthetic", messages: [{ text: "test" }] })).resolves.toMatchObject({ success: false });
    await sendPasswordResetEmail("test@example.invalid", "synthetic", "QA");
    await expect(lookupHealthProfile(undefined, "0000000000")).rejects.toThrow("Preview HealthFlow lookup is blocked");
    expect(fetchMock).not.toHaveBeenCalled(); expect(spies.send).not.toHaveBeenCalled();
  });
  it("keeps automatic deployment disabled and removes auth polling only in this mode", () => {
    expect(JSON.parse(readFileSync("vercel.json", "utf8")).git.deploymentEnabled[GUIDE_UI_PREVIEW_BRANCH]).toBe(false);
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain("isGuideUiPreview() ?");
  });
});
