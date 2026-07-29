import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuditCreate = vi.fn();
const mockCreateAuditRun = vi.fn();
const mockPageConfig = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { auditLog: { create: (...args: unknown[]) => mockAuditCreate(...args) } } }));
vi.mock("@/lib/messenger-config", () => ({ getMessengerPageConfig: (...args: unknown[]) => mockPageConfig(...args) }));
vi.mock("@/server/services/messenger-production-audit", () => ({ createMessengerAuditRun: (...args: unknown[]) => mockCreateAuditRun(...args) }));

const secrets = { pageId: "536890669508668", appId: "1019175470965183", pageToken: "page-token-never-leak", appToken: "app-token-never-leak" };

function configure() {
  vi.stubEnv("MESSENGER_APP_ID", secrets.appId);
  vi.stubEnv("MESSENGER_APP_ACCESS_TOKEN", secrets.appToken);
  mockPageConfig.mockReturnValue({ pageId: secrets.pageId, accessToken: secrets.pageToken });
  mockAuditCreate.mockResolvedValue({ id: "log-1" });
}

beforeEach(() => { vi.clearAllMocks(); configure(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

describe("Messenger Page repair", () => {
  it("fails closed on an invalid Page token without a Meta write or secret leakage", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 190, type: "OAuthException", message: secrets.pageToken } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 190, type: "OAuthException" } }), { status: 400 }))
      .mockResolvedValueOnce(Response.json({ id: secrets.appId }));
    vi.stubGlobal("fetch", fetchMock);
    const { repairMessengerPageBinding } = await import("@/server/services/messenger-page-repair");
    const result = await repairMessengerPageBinding({ storeId: "store-zhubei", storeSlug: "zhubei", requestedByUserId: "owner-1" });

    expect(result).toMatchObject({ status: "blocked", code: "PAGE_TOKEN_VALIDATION_FAILED", classification: "token_invalid_or_expired" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([, init]) => (init as RequestInit).method === "GET")).toBe(true);
    expect(JSON.stringify(result)).not.toContain(secrets.pageToken);
    expect(JSON.stringify(mockAuditCreate.mock.calls)).not.toContain(secrets.pageToken);
  });

  it("writes only the Page subscription after validation, then persists a formal audit", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: secrets.pageId }))
      .mockResolvedValueOnce(Response.json({ id: secrets.pageId }))
      .mockResolvedValueOnce(Response.json({ id: secrets.appId }))
      .mockResolvedValueOnce(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    mockCreateAuditRun.mockResolvedValue({ id: "audit-1", appValidated: true, pageTokenMatches: true, callbackMatches: true, configuredFields: ["messages", "messaging_postbacks", "messaging_optins", "messaging_referrals"], missingFields: [], pageAttached: true, callsSafeSummary: { app: { ok: true, httpStatus: 200, error: null } } });
    const { repairMessengerPageBinding } = await import("@/server/services/messenger-page-repair");
    const result = await repairMessengerPageBinding({ storeId: "store-zhubei", storeSlug: "zhubei", requestedByUserId: "owner-1" });

    expect(result).toMatchObject({ status: "repaired", auditRunId: "audit-1", audit: { missingFields: [], pageAttached: true } });
    expect(fetchMock.mock.calls.map(([, init]) => (init as RequestInit).method)).toEqual(["GET", "GET", "GET", "POST"]);
    expect(fetchMock.mock.calls[3][0]).toContain("/536890669508668/subscribed_apps?");
    expect(fetchMock.mock.calls[3][0]).toContain("subscribed_fields=messages%2Cmessaging_postbacks%2Cmessaging_optins%2Cmessaging_referrals");
    expect(mockCreateAuditRun).toHaveBeenCalledOnce();
  });

  it("rejects non-Zhubei stores before accessing Graph", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { repairMessengerPageBinding } = await import("@/server/services/messenger-page-repair");
    const result = await repairMessengerPageBinding({ storeId: "store-other", storeSlug: "other", requestedByUserId: "owner-1" });
    expect(result).toMatchObject({ status: "blocked", code: "STORE_NOT_ELIGIBLE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
