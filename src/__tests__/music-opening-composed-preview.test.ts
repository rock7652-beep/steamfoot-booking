// Synthetic URL-only fixtures. No password, network connection or live credentials.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertReviewedReleaseEnvironment } from "../../scripts/consultation-preview-scope.mjs";
import { MUSIC_OPENING_BRANCH } from "../../scripts/music-opening-preview-scope.mjs";
const mocks = vi.hoisted(() => ({ construct: vi.fn() }));
vi.mock("@prisma/client", () => ({ PrismaClient: class { constructor() { mocks.construct("main"); } } }));
vi.mock("../../generated/course-client", () => ({ PrismaClient: class { constructor() { mocks.construct("course"); } } }));
vi.mock("../../generated/spa-client", () => ({ PrismaClient: class { constructor() { mocks.construct("spa"); } } }));
vi.mock("@/lib/audit-db-context", () => ({ withAuditDatabaseContext: (client: unknown) => client }));
const direct = "postgresql://postgres@db.ttworfzgwejdeolegkxl.supabase.co/postgres";
const safe = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: MUSIC_OPENING_BRANCH,
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  DATABASE_URL: direct, DIRECT_URL: direct, WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "" };
const clients = [
  { name: "main", key: "prisma", load: async () => (await import("@/lib/db")).prisma },
  { name: "course", key: "coursePrisma", load: async () => (await import("@/lib/course-db")).coursePrisma },
  { name: "spa", key: "spaPrisma", load: async () => (await import("@/lib/spa-db")).spaPrisma },
];
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); for (const [key, value] of Object.entries(safe)) vi.stubEnv(key, value); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("composes the exact music scope in the existing build guard", () => {
  expect(assertReviewedReleaseEnvironment(safe)).toBe("music-opening-preview");
  for (const change of [{ WORKERS_CI_BRANCH: MUSIC_OPENING_BRANCH }, { CF_PAGES_BRANCH: "main" },
    { DIRECT_URL: direct + "?connection_limit=zero" }, { DIRECT_URL: direct + "?host=other.invalid" },
    { VERCEL_GIT_REPO_OWNER: "other" }, { VERCEL_ENV: "production" }]) {
    expect(() => assertReviewedReleaseEnvironment({ ...safe, ...change })).toThrow();
  }
});
describe.each(clients)("$name composed music runtime", ({ name, key, load }) => {
  it("validates music and shared guards before constructing a fresh isolated client", async () => {
    vi.stubGlobal(key, { stale: true });
    expect(await load()).not.toEqual({ stale: true });
    expect(mocks.construct).toHaveBeenCalledExactlyOnceWith(name);
  });
  it.each([
    ["DIRECT_URL", direct + "?host=other.invalid"], ["WORKERS_CI_BRANCH", "main"],
    ["VERCEL_ENV", "production"], ["VERCEL_GIT_COMMIT_REF", "main"],
    ["VERCEL_GIT_COMMIT_REF", "unapproved-preview"], ["VERCEL_GIT_REPO_OWNER", "other"],
  ])("rejects %s=%s before cached or fresh client access", async (envKey, value) => {
    vi.stubGlobal(key, { stale: true }); vi.stubEnv(envKey, value);
    await expect(load()).rejects.toThrow(); expect(mocks.construct).not.toHaveBeenCalled();
  });
});
