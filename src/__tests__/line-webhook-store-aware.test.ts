import { beforeEach, describe, expect, it, vi } from "vitest";

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
}));

vi.mock("@/server/services/line-account-sync", () => ({
  syncLineAccountForUser: vi.fn(),
}));

vi.mock("@/server/services/customer-identity-link", () => ({
  upsertCustomerIdentityLink: vi.fn(),
}));

vi.mock("@/lib/line-bind-log", () => ({
  logLineBindEvent: vi.fn(),
}));

function postReq(body: unknown, signature = "line-signature") {
  return new Request("https://example.test/api/line/webhook", {
    method: "POST",
    headers: { "x-line-signature": signature },
    body: JSON.stringify(body),
  });
}

describe("LINE webhook store-aware signature and reply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyLineSignatureMock.mockReturnValue(true);
    replyMessageMock.mockResolvedValue({ success: true });
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
});
