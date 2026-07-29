import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockPageConfig = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: { messengerAuditRun: { create: mockCreate, update: mockUpdate } },
}));

vi.mock("@/lib/messenger-config", () => ({
  getMessengerPageConfig: (...args: unknown[]) => mockPageConfig(...args),
}));

const secrets = {
  appId: "app-id-safe",
  appAccessToken: "app-access-token-must-not-leak",
  pageId: "536890669508668",
  pageAccessToken: "page-access-token-must-not-leak",
  webhookUrl: "https://www.steamfoot.com/api/messenger/webhook",
};

function configure() {
  vi.stubEnv("MESSENGER_APP_ID", secrets.appId);
  vi.stubEnv("MESSENGER_APP_ACCESS_TOKEN", secrets.appAccessToken);
  vi.stubEnv("MESSENGER_WEBHOOK_URL", secrets.webhookUrl);
  mockPageConfig.mockReturnValue({ pageId: secrets.pageId, accessToken: secrets.pageAccessToken });
}

function successfulGraphResponses() {
  return vi.fn()
    .mockResolvedValueOnce(Response.json({ id: secrets.appId }))
    .mockResolvedValueOnce(Response.json({ id: secrets.pageId }))
    .mockResolvedValueOnce(Response.json({ id: secrets.pageId }))
    .mockResolvedValueOnce(Response.json({ data: [{ object: "page", callback_url: secrets.webhookUrl, fields: ["messages", "messaging_postbacks", "messaging_optins", "messaging_referrals"] }] }))
    .mockResolvedValueOnce(Response.json({ data: [{ id: secrets.appId, subscribed_fields: ["messages", "messaging_postbacks", "messaging_optins", "messaging_referrals"] }] }));
}

beforeEach(() => {
  vi.clearAllMocks();
  configure();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("persistent Messenger production audit", () => {
  it("uses only GET Graph calls and produces a de-identified success result", async () => {
    const fetchMock = successfulGraphResponses();
    vi.stubGlobal("fetch", fetchMock);
    const { runMessengerProductionAudit } = await import("@/server/services/messenger-production-audit");

    const result = await runMessengerProductionAudit("zhubei");
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({ appValidated: true, pageTokenMatches: true, callbackMatches: true, pageAttached: true, missingFields: [] });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const [, options] of fetchMock.mock.calls) expect(options).toMatchObject({ method: "GET", cache: "no-store" });
    expect(serialized).not.toContain(secrets.appAccessToken);
    expect(serialized).not.toContain(secrets.pageAccessToken);
  });

  it("persists safe Graph failures without raw response bodies or credentials", async () => {
    mockCreate.mockResolvedValue({ id: "audit-1" });
    mockUpdate.mockImplementation(async ({ data }) => ({ id: "audit-1", ...data }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("token=must-not-leak", { status: 403 })));
    const { createMessengerAuditRun } = await import("@/server/services/messenger-production-audit");

    const run = await createMessengerAuditRun({ storeId: "store-zhubei", storeSlug: "zhubei", requestedByUserId: "owner-1" });
    const updateData = mockUpdate.mock.calls[0][0].data;
    const serialized = JSON.stringify({ run, updateData });

    expect(updateData.status).toBe("COMPLETED_WITH_ERRORS");
    expect(updateData.errorCode).toBe("GRAPH_REQUEST_FAILED");
    expect(updateData.callsSafeSummary.app).toEqual({ ok: false, httpStatus: 403, error: "http_error" });
    expect(serialized).not.toContain("token=must-not-leak");
    expect(serialized).not.toContain(secrets.appAccessToken);
    expect(serialized).not.toContain(secrets.pageAccessToken);
  });
});
