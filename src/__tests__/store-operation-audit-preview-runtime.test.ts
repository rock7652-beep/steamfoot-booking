import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORE_OPERATION_AUDIT_PREVIEW_BRANCH } from "../../scripts/store-operation-audit-preview-scope.mjs";

const mocks = vi.hoisted(() => ({ construct: vi.fn(), audit: vi.fn((client: unknown) => client), resend: vi.fn(), sendMail: vi.fn() }));
vi.mock("@prisma/client", () => ({ PrismaClient: class { constructor(options: unknown) { mocks.construct("main", options); } } }));
vi.mock("../../generated/course-client", () => ({ PrismaClient: class { constructor(options: unknown) { mocks.construct("course", options); } } }));
vi.mock("../../generated/spa-client", () => ({ PrismaClient: class { constructor(options: unknown) { mocks.construct("spa", options); } } }));
vi.mock("@/lib/audit-db-context", () => ({ withAuditDatabaseContext: mocks.audit }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.sendMail }; constructor() { mocks.resend(); } } }));

const direct = "postgresql://postgres:fixture@db.ttworfzgwejdeolegkxl.supabase.co/postgres";
const pooled = "postgresql://postgres.ttworfzgwejdeolegkxl:fixture@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
const production = "postgresql://postgres:fixture@db.qijlnhtpbintanzpxkvf.supabase.co/postgres";
const clients = [
  { name: "main", key: "prisma", load: async () => (await import("@/lib/db")).prisma },
  { name: "course", key: "coursePrisma", load: async () => (await import("@/lib/course-db")).coursePrisma },
  { name: "spa", key: "spaPrisma", load: async () => (await import("@/lib/spa-db")).spaPrisma },
];

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", STORE_OPERATION_AUDIT_PREVIEW_BRANCH);
  vi.stubEnv("VERCEL_GIT_REPO_OWNER", "rock7652-beep");
  vi.stubEnv("VERCEL_GIT_REPO_SLUG", "steamfoot-booking");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("DATABASE_URL", pooled);
  vi.stubEnv("DIRECT_URL", direct);
  for (const { key } of clients) vi.stubGlobal(key, undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe.each(clients)("$name runtime database isolation", ({ name, key, load }) => {
  it.each([false, true])("rejects unsafe configuration before fresh or cached client access (cached=%s)", async (cached) => {
    if (cached) vi.stubGlobal(key, { unverifiedCachedClient: true });
    for (const [envKey, value] of [
      ["DATABASE_URL", undefined], ["DIRECT_URL", undefined],
      ["DATABASE_URL", "malformed"], ["DIRECT_URL", ""],
      ["DATABASE_URL", production], ["DIRECT_URL", production],
      ["DATABASE_URL", pooled + "?host=unverified.invalid"],
      ["DIRECT_URL", direct + "?hostaddr=127.0.0.1"],
      ["DATABASE_URL", pooled + "?schema=other"],
      ["DIRECT_URL", direct + "?schema=public&schema=other"],
      ["DIRECT_URL", direct + "?options=-csearch_path=other"],
      ["VERCEL_ENV", "production"], ["VERCEL_ENV", undefined],
      ["VERCEL_GIT_COMMIT_REF", undefined], ["VERCEL_GIT_COMMIT_REF", "main"],
      ["VERCEL_GIT_REPO_OWNER", undefined], ["VERCEL_GIT_REPO_OWNER", "wrong"],
      ["VERCEL_GIT_REPO_SLUG", undefined], ["VERCEL_GIT_REPO_SLUG", "wrong"],
    ] as const) {
      vi.resetModules();
      const previous = process.env[envKey];
      vi.stubEnv(envKey, value);
      await expect(load()).rejects.toThrow(/Store operation audit|Sports shared-card/);
      vi.stubEnv(envKey, previous);
      expect(mocks.construct).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    }
  });

  it("rejects invalid metadata before even reading a cached singleton", async () => {
    const read = vi.fn(() => ({ unverifiedCachedClient: true }));
    Object.defineProperty(globalThis, key, { configurable: true, get: read });
    vi.stubEnv("VERCEL_GIT_REPO_OWNER", "wrong");
    await expect(load()).rejects.toThrow("Store operation audit");
    expect(read).not.toHaveBeenCalled();
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("constructs from validated isolated URLs and does not trust a pre-existing singleton", async () => {
    const cached = { unverifiedCachedClient: true };
    vi.stubGlobal(key, cached);
    const client = await load();
    expect(client).not.toBe(cached);
    expect(mocks.construct).toHaveBeenCalledOnce();
    expect(mocks.construct.mock.calls[0][0]).toBe(name);
    const options = mocks.construct.mock.calls[0][1] as { datasources: { db: { url: string } } };
    const url = new URL(options.datasources.db.url);
    expect(url.hostname).toBe(new URL(pooled).hostname);
    expect(url.username).toBe("postgres.ttworfzgwejdeolegkxl");
    expect(process.env.DIRECT_URL).toBe(direct);
    expect(mocks.audit).toHaveBeenCalledOnce();
  });

  it.each(["main", "unrelated-preview"])("preserves clearly mocked non-deployed %s unit tests", async (branch) => {
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", branch);
    vi.stubEnv("VERCEL_ENV", branch === "main" ? "production" : "preview");
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("DIRECT_URL", undefined);
    const cached = { existingClient: true };
    vi.stubGlobal(key, cached);
    expect(await load()).toBe(cached);
    expect(mocks.construct).not.toHaveBeenCalled();
  });
});

describe("store operation audit outbound notification suppression", () => {
  it.each(["preview", "production", "development", undefined])("blocks senders for this exact branch in %s", async (environment) => {
    vi.stubEnv("VERCEL_ENV", environment);
    vi.stubEnv("STEAM_BUTLER_LINE_CHANNEL_ACCESS_TOKEN", "fixture-token");
    vi.stubEnv("RESEND_API_KEY", "fixture-token");
    vi.stubEnv("NEXTAUTH_URL", "https://fixture.example.test");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { isPreviewExternalIntegrationBlocked } = await import("@/lib/runtime-env");
    const { pushSteamButlerMessage } = await import("@/lib/line");
    const { sendMessengerMessages } = await import("@/lib/messenger");
    const { sendActivationEmail } = await import("@/lib/email");
    const { readPreviewLineAcceptance } = await import("@/lib/preview-line-acceptance");
    expect(isPreviewExternalIntegrationBlocked()).toBe(true);
    expect(readPreviewLineAcceptance()).toBeNull();
    await expect(pushSteamButlerMessage("fixture-recipient", [{ type: "text", text: "test" }])).resolves.toMatchObject({ success: false, errorType: "preview_blocked" });
    await expect(sendMessengerMessages({ pageId: "fixture-page", pageAccessToken: "fixture-token", recipientId: "fixture-recipient", messages: [{ text: "test" }] })).resolves.toMatchObject({ success: false });
    await sendActivationEmail("fixture@example.test", "fixture-token", "Fixture");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "main", "wrong"])("blocks outbound integrations with missing/wrong branch metadata (%s)", async (branch) => {
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", branch);
    vi.stubEnv("VERCEL_ENV", undefined);
    const { isPreviewExternalIntegrationBlocked } = await import("@/lib/runtime-env");
    expect(isPreviewExternalIntegrationBlocked()).toBe(true);
  });

  it.each(["main", "unrelated-preview"])("preserves the existing policy in non-deployed mocked %s tests", async (branch) => {
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", branch);
    const { isPreviewExternalIntegrationBlocked } = await import("@/lib/runtime-env");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isPreviewExternalIntegrationBlocked()).toBe(false);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isPreviewExternalIntegrationBlocked()).toBe(true);
  });
});

describe("provider build-command override defense", () => {
  it("allows Next configuration to load only with the verified Preview metadata", async () => {
    await expect(import("../../next.config")).resolves.toHaveProperty("default");
  });
  it.each(["VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG"])("rejects missing %s even when the package build command is bypassed", async (key) => {
    vi.stubEnv(key, undefined);
    await expect(import("../../next.config")).rejects.toThrow(/Store operation audit|Sports shared-card/);
    expect(mocks.construct).not.toHaveBeenCalled();
  });
});


describe("reviewed production main release boundary", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "production"));
  it("loads Next and restores production outbound policy only for exact production main", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    await expect(import("../../next.config")).resolves.toHaveProperty("default");
    const { isPreviewExternalIntegrationBlocked } = await import("@/lib/runtime-env");
    expect(isPreviewExternalIntegrationBlocked()).toBe(false);
    const { readPreviewLineAcceptance } = await import("@/lib/preview-line-acceptance");
    expect(readPreviewLineAcceptance()).toBeNull();
  });

  it.each(clients)("restores normal $name client construction and cache reuse", async ({ key, load }) => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    vi.stubEnv("DATABASE_URL", production);
    vi.stubEnv("DIRECT_URL", production);
    await load();
    expect(mocks.construct).toHaveBeenCalledOnce();
    vi.resetModules();
    mocks.construct.mockClear();
    const cached = { productionClient: true };
    vi.stubGlobal(key, cached);
    expect(await load()).toBe(cached);
    expect(mocks.construct).not.toHaveBeenCalled();
  });

  it.each([
    ["VERCEL", undefined], ["VERCEL_ENV", undefined], ["VERCEL_ENV", "preview"],
    ["VERCEL_GIT_COMMIT_REF", undefined], ["VERCEL_GIT_COMMIT_REF", ""],
    ["VERCEL_GIT_COMMIT_REF", STORE_OPERATION_AUDIT_PREVIEW_BRANCH],
    ["VERCEL_GIT_REPO_OWNER", "wrong"], ["VERCEL_GIT_REPO_SLUG", undefined],
    ["WORKERS_CI_BRANCH", STORE_OPERATION_AUDIT_PREVIEW_BRANCH],
    ["CF_PAGES_BRANCH", STORE_OPERATION_AUDIT_PREVIEW_BRANCH],
  ])("does not open production via incomplete/conflicting %s=%s", async (key, value) => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    // Prevent mocked-unit exemption from masking this deployed-path assertion.
    vi.stubEnv("VITEST_WORKER_ID", undefined);
    vi.stubEnv(key, value);
    await expect(import("../../next.config")).rejects.toThrow(/Store operation audit|Sports shared-card/);
    const { isPreviewExternalIntegrationBlocked } = await import("@/lib/runtime-env");
    expect(isPreviewExternalIntegrationBlocked()).toBe(true);
    expect(mocks.construct).not.toHaveBeenCalled();
  });
});
