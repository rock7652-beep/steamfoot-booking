import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSULTATION_PREVIEW_BRANCH } from "../../scripts/consultation-preview-scope.mjs";

const mocks = vi.hoisted(() => ({
  construct: vi.fn(), query: vi.fn(), audit: vi.fn((client: unknown) => client),
}));
vi.mock("@prisma/client", () => ({ PrismaClient: class {
  $queryRaw = mocks.query;
  constructor(options: unknown) { mocks.construct("main", options); }
} }));
vi.mock("../../generated/spa-client", () => ({ PrismaClient: class {
  $queryRaw = mocks.query;
  constructor(options: unknown) { mocks.construct("spa", options); }
} }));
vi.mock("../../generated/course-client", () => ({ PrismaClient: class {
  $queryRaw = mocks.query;
  constructor(options: unknown) { mocks.construct("course", options); }
} }));
vi.mock("@/lib/audit-db-context", () => ({ withAuditDatabaseContext: mocks.audit }));

const direct = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const pool = "postgresql://postgres.ttworfzgwejdeolegkxl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
const clients = [
  { name: "main", key: "prisma", load: async () => (await import("@/lib/db")).prisma },
  { name: "spa", key: "spaPrisma", load: async () => (await import("@/lib/spa-db")).spaPrisma },
  { name: "course", key: "coursePrisma", load: async () => (await import("@/lib/course-db")).coursePrisma },
];
const invalidSettings = [
  ["DATABASE_URL", undefined], ["DIRECT_URL", undefined],
  ["DATABASE_URL", "malformed"], ["DIRECT_URL", ""],
  ["DATABASE_URL", pool.replace("ttworfzgwejdeolegkxl", "another-project")],
  ["DIRECT_URL", direct.replace("ttworfzgwejdeolegkxl", "another-project")],
  ["DATABASE_URL", pool + "?host=remote.invalid"],
  ["DIRECT_URL", direct + "?hostaddr=127.0.0.1"],
  ["DATABASE_URL", pool + "?schema=private"],
  ["DIRECT_URL", direct + "?schema=public&schema=public"],
  ["DIRECT_URL", direct + "?options=-csearch_path=private"],
  ["VERCEL_ENV", "production"], ["VERCEL_ENV", undefined],
  ["VERCEL_GIT_COMMIT_REF", undefined], ["VERCEL_GIT_COMMIT_REF", "main"],
  ["VERCEL_GIT_REPO_OWNER", undefined], ["VERCEL_GIT_REPO_OWNER", "wrong"],
  ["VERCEL_GIT_REPO_SLUG", undefined], ["VERCEL_GIT_REPO_SLUG", "wrong"],
  ["CONSULTATION_HQ_ENABLED", undefined], ["CONSULTATION_HQ_ENABLED", "false"],
  ["CONSULTATION_PREVIEW_INTAKE_ENABLED", undefined], ["CONSULTATION_PREVIEW_INTAKE_ENABLED", "TRUE"],
  ["WORKERS_CI_BRANCH", "main"], ["CF_PAGES_BRANCH", "main"],
] as const;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  for (const [key, value] of Object.entries({
    VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: CONSULTATION_PREVIEW_BRANCH,
    VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
    CONSULTATION_HQ_ENABLED: "true", CONSULTATION_PREVIEW_INTAKE_ENABLED: "true",
    DATABASE_URL: pool, DIRECT_URL: direct,
    GUIDE_UI_PREVIEW: "", WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "",
  })) vi.stubEnv(key, value);
  for (const { key } of clients) vi.stubGlobal(key, undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe.each(clients)("$name consultation release-bound client", ({ name, key, load }) => {
  it.each([false, true])("denies invalid settings before construction or query (cached=%s)", async (cached) => {
    if (cached) vi.stubGlobal(key, { $queryRaw: mocks.query });
    for (const [setting, value] of invalidSettings) {
      vi.resetModules();
      const previous = process.env[setting];
      vi.stubEnv(setting, value);
      await expect(load()).rejects.toThrow(/Consultation|Sports shared-card/);
      vi.stubEnv(setting, previous);
      expect(mocks.construct).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
      expect(mocks.query).not.toHaveBeenCalled();
    }
  });

  it("uses only a newly constructed verified client, never a cached pre-override client", async () => {
    const cached = { $queryRaw: mocks.query };
    vi.stubGlobal(key, cached);
    expect(await load()).not.toBe(cached);
    expect(mocks.construct).toHaveBeenCalledOnce();
    expect(mocks.construct.mock.calls[0][0]).toBe(name);
    const options = mocks.construct.mock.calls[0][1] as { datasources: { db: { url: string } } };
    const url = new URL(options.datasources.db.url);
    expect(url.hostname).toBe(new URL(pool).hostname);
    expect(url.username).toBe("postgres.ttworfzgwejdeolegkxl");
    expect(url.pathname).toBe("/postgres");
    expect(process.env.DIRECT_URL).toBe(direct);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("does not even read the cached singleton before rejecting invalid metadata", async () => {
    const read = vi.fn(() => ({ $queryRaw: mocks.query }));
    Object.defineProperty(globalThis, key, { configurable: true, get: read });
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", undefined);
    await expect(load()).rejects.toThrow("exact authorized Preview branch and repository metadata");
    expect(read).not.toHaveBeenCalled();
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("preserves only the nondeployed mocked unit-test exception", async () => {
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VITEST", "true");
    vi.stubEnv("VITEST_WORKER_ID", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("DIRECT_URL", undefined);
    const cached = { $queryRaw: mocks.query };
    vi.stubGlobal(key, cached);
    expect(await load()).toBe(cached);
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects production Preview-flag contamination before reading even a cached global", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    const read = vi.fn(() => ({ $queryRaw: mocks.query }));
    Object.defineProperty(globalThis, key, { configurable: true, get: read });
    await expect(load()).rejects.toThrow("Preview intake flag must be disabled on production main");
    expect(read).not.toHaveBeenCalled();
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("retains the exact guide sandbox without constructing or reading a DB client", async () => {
    vi.stubEnv("GUIDE_UI_PREVIEW", "1");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feat/public-guide-articles-20261007");
    const synthetic = "postgresql://guide-ui:guide-ui@127.0.0.1:9/guide_ui_preview";
    vi.stubEnv("DATABASE_URL", synthetic);
    vi.stubEnv("DIRECT_URL", synthetic);
    const client = await load();
    expect(() => client.$queryRaw).toThrow("no database access");
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe("consultation provider build-command override defense", () => {
  it("allows Next configuration only with the verified Preview tuple", async () => {
    await expect(import("../../next.config")).resolves.toHaveProperty("default");
  });

  it("rejects every invalid setting even when the package build command is bypassed", async () => {
    for (const [setting, value] of invalidSettings) {
      vi.resetModules();
      const previous = process.env[setting];
      vi.stubEnv(setting, value);
      await expect(import("../../next.config")).rejects.toThrow(/Consultation|Sports shared-card/);
      vi.stubEnv(setting, previous);
    }
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects production Preview-flag contamination before Next config work", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    await expect(import("../../next.config")).rejects.toThrow("Preview intake flag must be disabled on production main");
    expect(mocks.construct).not.toHaveBeenCalled();
  });
});

describe("production consultation rollout defaults", () => {
  it.each([undefined, "false"])("keeps HQ receipt disabled for flag %s and preserves the existing Sheet-only path", async (flag) => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    vi.stubEnv("CONSULTATION_HQ_ENABLED", flag);
    vi.stubEnv("CONSULTATION_PREVIEW_INTAKE_ENABLED", undefined);
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    const { POST } = await import("@/app/pricing/submit/route");
    const payload = {
      requestId: "f2170225-17f8-4ad7-8031-f305afba256f", storeName: "Synthetic release check",
      contactName: "Synthetic", industry: "服務", lineId: "TEST-NOT-A-CONTACT", needs: ["預約"], replaceReason: [],
    };
    const response = await POST(new Request("https://example.test/pricing/submit", {
      method: "POST", headers: { origin: "https://example.test" }, body: JSON.stringify(payload),
    }));
    expect(await response.json()).toEqual({ ok: true, saved: true, requestId: payload.requestId });
    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(process.env.CONSULTATION_HQ_ENABLED).toBe(flag);
  });
});

describe("consultation outbound release boundary", () => {
  it.each(["preview", "production", "development", undefined])("blocks consultation-branch outbound integrations even with environment %s", async (environment) => {
    vi.stubEnv("VERCEL_ENV", environment);
    const { isPreviewExternalIntegrationBlocked } = await import("@/lib/runtime-env");
    const { readPreviewLineAcceptance } = await import("@/lib/preview-line-acceptance");
    expect(isPreviewExternalIntegrationBlocked()).toBe(true);
    expect(readPreviewLineAcceptance()).toBeNull();
  });
});
