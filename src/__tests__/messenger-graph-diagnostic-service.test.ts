import { afterEach, describe, expect, it, vi } from "vitest";

const mockAuditCreate = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { auditLog: { create: (...args: unknown[]) => mockAuditCreate(...args) } } }));

describe("Messenger read-only Graph diagnostic", () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

  it("uses only the requested GET endpoints and stores no raw credentials", async () => {
    const pageToken = "EA-page-token";
    vi.stubEnv("MESSENGER_APP_ACCESS_TOKEN", "app-token");
    vi.stubEnv("MESSENGER_PAGE_ACCESS_TOKEN_ZHUBEI", pageToken);
    mockAuditCreate.mockResolvedValue({ id: "audit-1" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "1019175470965183" }))
      .mockResolvedValueOnce(Response.json({ id: "536890669508668", name: "Page" }))
      .mockResolvedValueOnce(Response.json({ id: "536890669508668" }))
      .mockResolvedValueOnce(Response.json({ id: "536890669508668", name: "Page" }))
      .mockResolvedValueOnce(Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const { diagnoseMessengerGraph } = await import("@/server/services/messenger-graph-diagnostic");
    const result = await diagnoseMessengerGraph({ actorUserId: "owner-1", storeId: "store-zhubei" });

    expect(result).toMatchObject({ classification: "NO_GRAPH_ERROR", calls: { me: { identity: "expected_page" }, page: { identity: "expected_page" } } });
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes("/app?"))).toBe(true);
    expect(urls.some((url) => url.includes("/me?"))).toBe(true);
    expect(urls.some((url) => url.includes("/536890669508668?access_token="))).toBe(true);
    expect(urls.some((url) => url.includes("/536890669508668?fields=id,name&access_token="))).toBe(true);
    expect(urls.some((url) => url.includes("/536890669508668/subscribed_apps?"))).toBe(true);
    expect(fetchMock.mock.calls.every(([, init]) => (init as RequestInit).method === "GET")).toBe(true);
    expect(JSON.stringify(result)).not.toContain(pageToken);
    expect(JSON.stringify(mockAuditCreate.mock.calls)).not.toContain(pageToken);
  });

  it("identifies a non-Page token and a missing permission from safe evidence", async () => {
    vi.stubEnv("MESSENGER_APP_ACCESS_TOKEN", "app-token");
    vi.stubEnv("MESSENGER_PAGE_ACCESS_TOKEN_ZHUBEI", "page-token");
    mockAuditCreate.mockResolvedValue({ id: "audit-1" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "1019175470965183" }))
      .mockResolvedValueOnce(Response.json({ id: "user-id" }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { type: "OAuthException", code: 200, message: "Requires pages_read_engagement" } }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { type: "OAuthException", code: 200, message: "Requires pages_read_engagement" } }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { type: "OAuthException", code: 200, message: "Requires pages_read_engagement" } }), { status: 403 })));
    const { diagnoseMessengerGraph } = await import("@/server/services/messenger-graph-diagnostic");
    const result = await diagnoseMessengerGraph({ actorUserId: "owner-1", storeId: "store-zhubei" });

    expect(result.findings).toEqual(expect.arrayContaining(["MISSING_PERMISSION", "WRONG_PAGE_OR_NON_PAGE_TOKEN"]));
    expect(result.classification).toBe("MISSING_PERMISSION");
  });
});
