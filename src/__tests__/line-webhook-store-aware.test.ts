import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyLineSignatureMock = vi.fn(
  (_storeId: string, _body: string, _signature: string) => true,
);
const replyMessageMock = vi.fn(
  async (
    _storeId: string,
    _replyToken: string,
    _messages: unknown[],
  ): Promise<{ success: boolean; error?: string }> => ({ success: true }),
);
const verifySteamButlerLineSignatureMock = vi.fn(
  (_body: string, _signature: string) => true,
);
const replySteamButlerMessageMock = vi.fn(
  async (
    _replyToken: string,
    _messages: unknown[],
  ): Promise<{ success: boolean; error?: string }> => ({ success: true }),
);
const bindLineToCustomerInStoreMock = vi.fn();

const mockPrisma = {
  store: {
    findFirst: vi.fn(),
  },
  customer: {
    findFirst: vi.fn(async () => null),
    update: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
};

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/line", () => ({
  verifyLineSignature: (storeId: string, body: string, signature: string) =>
    verifyLineSignatureMock(storeId, body, signature),
  replyMessage: (storeId: string, replyToken: string, messages: unknown[]) =>
    replyMessageMock(storeId, replyToken, messages),
  verifySteamButlerLineSignature: (body: string, signature: string) =>
    verifySteamButlerLineSignatureMock(body, signature),
  replySteamButlerMessage: (replyToken: string, messages: unknown[]) =>
    replySteamButlerMessageMock(replyToken, messages),
}));

vi.mock("@/server/services/line-account-sync", () => ({
  syncLineAccountForUser: vi.fn(),
}));

vi.mock("@/server/services/customer-identity-link", () => ({
  upsertCustomerIdentityLink: vi.fn(),
}));

vi.mock("@/server/services/bind-line-to-customer", () => ({
  bindLineToCustomerInStore: (...args: unknown[]) =>
    bindLineToCustomerInStoreMock(...args),
}));

vi.mock("@/lib/line-bind-log", () => ({
  logLineBindEvent: vi.fn(),
  maskLineUserId: (value: string | null | undefined) => value ? "masked" : "(none)",
}));

function postReq(body: unknown, signature = "line-signature") {
  return new Request("https://example.test/api/line/webhook", {
    method: "POST",
    headers: { "x-line-signature": signature },
    body: JSON.stringify(body),
  });
}

describe("LINE webhook store-aware signature and reply", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    verifyLineSignatureMock.mockReturnValue(true);
    replyMessageMock.mockResolvedValue({ success: true });
    verifySteamButlerLineSignatureMock.mockReturnValue(true);
    replySteamButlerMessageMock.mockResolvedValue({ success: true });
    bindLineToCustomerInStoreMock.mockReset();
    mockPrisma.store.findFirst.mockResolvedValue({ id: "store-hsinchu" });
  });

  it("resolves destination before signature verification and uses that store for replies", async () => {
    const body = {
      destination: "D_hsinchu",
      events: [
        {
          type: "follow",
          replyToken: "reply-token-1",
          source: { type: "user", userId: "U_hsinchu_customer" },
        },
      ],
    };

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq(body));

    expect(res.status).toBe(200);
    expect(mockPrisma.store.findFirst).toHaveBeenCalledWith({
      where: { lineDestination: "D_hsinchu" },
      select: { id: true },
    });
    expect(verifyLineSignatureMock).toHaveBeenCalledWith(
      "store-hsinchu",
      JSON.stringify(body),
      "line-signature",
    );
    expect(replyMessageMock).toHaveBeenCalledWith(
      "store-hsinchu",
      "reply-token-1",
      expect.any(Array),
    );
  });

  it("rejects invalid per-store signatures before handling events", async () => {
    verifyLineSignatureMock.mockReturnValueOnce(false);
    const body = {
      destination: "D_hsinchu",
      events: [
        {
          type: "follow",
          replyToken: "reply-token-1",
          source: { type: "user", userId: "U_hsinchu_customer" },
        },
      ],
    };

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq(body));

    expect(res.status).toBe(401);
    expect(replyMessageMock).not.toHaveBeenCalled();
  });

  it("replies with the plan Flex Message for the exact trigger text", async () => {
    const body = {
      destination: "D_hsinchu",
      events: [
        {
          type: "message",
          replyToken: "reply-token-plan",
          source: { type: "user", userId: "U_hsinchu_customer" },
          message: { type: "text", id: "message-plan", text: "找到適合方案" },
        },
      ],
    };

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq(body));

    expect(res.status).toBe(200);
    expect(replyMessageMock).toHaveBeenCalledWith("store-hsinchu", "reply-token-plan", [
      expect.objectContaining({
        type: "flex",
        altText: "找到適合你的方案",
        contents: expect.objectContaining({
          body: expect.objectContaining({
            contents: expect.arrayContaining([
              expect.objectContaining({ text: "找到適合你的方案" }),
            ]),
          }),
          footer: expect.objectContaining({
            contents: expect.arrayContaining([
              expect.objectContaining({
                action: expect.objectContaining({ uri: "https://steam-butler-check.vercel.app/" }),
              }),
              expect.objectContaining({
                action: expect.objectContaining({ text: "我想了解適合我的方案" }),
              }),
            ]),
          }),
        }),
      }),
    ]);
  });

  it("returns 200 for LINE webhook verification events without replying", async () => {
    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq({ destination: "D_hsinchu", events: [] }));

    expect(res.status).toBe(200);
    expect(replyMessageMock).not.toHaveBeenCalled();
  });

  it("handles the brand destination without querying a Store", async () => {
    vi.stubEnv("STEAM_BUTLER_LINE_DESTINATION", "D_brand_support");
    const body = {
      destination: "D_brand_support",
      events: [
        {
          type: "message",
          replyToken: "reply-token-brand-plan",
          message: { type: "text", id: "message-brand-plan", text: "找到適合方案" },
        },
      ],
    };

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq(body, "brand-signature"));

    expect(res.status).toBe(200);
    expect(verifySteamButlerLineSignatureMock).toHaveBeenCalledWith(JSON.stringify(body), "brand-signature");
    expect(mockPrisma.store.findFirst).not.toHaveBeenCalled();
    expect(replySteamButlerMessageMock).toHaveBeenCalledWith("reply-token-brand-plan", [
      expect.objectContaining({ type: "flex", altText: "找到適合你的方案" }),
    ]);
  });

  it("rejects an invalid signature for the brand destination before handling events", async () => {
    vi.stubEnv("STEAM_BUTLER_LINE_DESTINATION", "D_brand_support");
    verifySteamButlerLineSignatureMock.mockReturnValueOnce(false);
    const body = {
      destination: "D_brand_support",
      events: [{ type: "message", replyToken: "reply-token", message: { type: "text", text: "找到適合方案" } }],
    };

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq(body, "invalid-brand-signature"));

    expect(res.status).toBe(401);
    expect(mockPrisma.store.findFirst).not.toHaveBeenCalled();
    expect(replySteamButlerMessageMock).not.toHaveBeenCalled();
  });

  it("does not reply to non-whitelisted brand text", async () => {
    vi.stubEnv("STEAM_BUTLER_LINE_DESTINATION", "D_brand_support");
    const body = {
      destination: "D_brand_support",
      events: [{ type: "message", replyToken: "reply-token", message: { type: "text", text: "其他文字" } }],
    };

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq(body));

    expect(res.status).toBe(200);
    expect(mockPrisma.store.findFirst).not.toHaveBeenCalled();
    expect(replySteamButlerMessageMock).not.toHaveBeenCalled();
  });

  it("returns 200 for signed brand verification events without querying a Store", async () => {
    vi.stubEnv("STEAM_BUTLER_LINE_DESTINATION", "D_brand_support");
    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq({ destination: "D_brand_support", events: [] }));

    expect(res.status).toBe(200);
    expect(mockPrisma.store.findFirst).not.toHaveBeenCalled();
    expect(replySteamButlerMessageMock).not.toHaveBeenCalled();
  });

  it("safely ignores events whose destination does not map to a store", async () => {
    mockPrisma.store.findFirst.mockResolvedValueOnce(null);
    const body = {
      destination: "D_unmapped",
      events: [
        {
          type: "message",
          replyToken: "reply-token-plan",
          source: { type: "user", userId: "U_customer" },
          message: { type: "text", id: "message-plan", text: "找到適合方案" },
        },
      ],
    };

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq(body));

    expect(res.status).toBe(200);
    expect(verifyLineSignatureMock).not.toHaveBeenCalled();
    expect(replyMessageMock).not.toHaveBeenCalled();
  });

  it("does not enter phone binding when the hsinchu signature is unavailable", async () => {
    verifyLineSignatureMock.mockReturnValueOnce(false);
    const body = {
      destination: "D_hsinchu",
      events: [
        {
          type: "message",
          replyToken: "reply-token-phone",
          source: { type: "user", userId: "U_hsinchu_customer" },
          message: { type: "text", text: "0912345678" },
        },
      ],
    };

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq(body));

    expect(res.status).toBe(401);
    expect(bindLineToCustomerInStoreMock).not.toHaveBeenCalled();
    expect(replyMessageMock).not.toHaveBeenCalled();
  });
});
