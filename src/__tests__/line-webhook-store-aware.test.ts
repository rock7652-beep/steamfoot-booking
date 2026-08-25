import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyLineSignatureMock = vi.fn(
  (_storeId: string, _body: string, _signature: string) => true,
);
type LineReplyResult = {
  success: boolean;
  error?: string;
  httpStatus?: number | null;
  errorType?: string;
};
const replyMessageMock = vi.fn(
  async (
    _storeId: string,
    _replyToken: string,
    _messages: unknown[],
  ): Promise<LineReplyResult> => ({ success: true }),
);
const verifySteamButlerLineSignatureMock = vi.fn(
  (_body: string, _signature: string) => true,
);
const replySteamButlerMessageMock = vi.fn(
  async (
    _replyToken: string,
    _messages: unknown[],
  ): Promise<LineReplyResult> => ({ success: true }),
);
const bindLineToCustomerInStoreMock = vi.fn();
const probeStoreLineRecipientMock = vi.fn();
const captureLineRebindCandidateMock = vi.fn();
const digitalButlerHandleTextMock = vi.fn(
  async (_input: unknown): Promise<{
    handled: boolean;
    messages: unknown[];
    outcome: string;
    replyGuard?: { conversationId: string; requiresActiveConversation: true };
  }> => ({
    handled: false,
    messages: [],
    outcome: "NO_MATCH",
  }),
);
const digitalButlerDeliverReplyIfActiveMock = vi.fn(
  async (_storeId: string, _conversationId: string, deliver: () => Promise<void>) => {
    await deliver();
    return true;
  },
);
let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

const mockPrisma = {
  store: {
    findFirst: vi.fn(),
  },
  customer: {
    findMany: vi.fn(async (): Promise<Record<string, unknown>[]> => []),
    findFirst: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
    findUnique: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
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
  probeStoreLineRecipient: (...args: unknown[]) =>
    probeStoreLineRecipientMock(...args),
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

vi.mock("@/server/services/line-rebind", () => ({
  captureLineRebindCandidate: (...args: unknown[]) => captureLineRebindCandidateMock(...args),
  lineWebhookEventKey: ({ webhookEventId, messageId }: { webhookEventId?: string; messageId?: string }) =>
    webhookEventId ? `line:${webhookEventId}` : messageId ? `test:${messageId}` : null,
}));

vi.mock("@/lib/line-bind-log", () => ({
  logLineBindEvent: vi.fn(),
  maskLineUserId: (value: string | null | undefined) => value ? "masked" : "(none)",
}));

vi.mock("@/server/services/digital-butler-runtime", () => ({
  DigitalButlerRuntime: class {
    handleText = (input: unknown) => digitalButlerHandleTextMock(input);
    deliverReplyIfActive = (
      storeId: string,
      conversationId: string,
      deliver: () => Promise<void>,
    ) => digitalButlerDeliverReplyIfActiveMock(storeId, conversationId, deliver);
  },
}));

function postReq(body: unknown, signature = "line-signature") {
  return new Request("https://example.test/api/line/webhook", {
    method: "POST",
    headers: { "x-line-signature": signature },
    body: JSON.stringify(body),
  });
}

function brandLogEvents() {
  return consoleLogSpy.mock.calls
    .map((call: unknown[]) => {
      const [message] = call;
      if (typeof message !== "string") return null;
      try {
        const parsed: unknown = JSON.parse(message);
        return typeof parsed === "object" && parsed !== null && "event" in parsed
          ? parsed
          : null;
      } catch {
        return null;
      }
    })
    .filter((event: unknown): event is Record<string, unknown> => event !== null);
}

describe("LINE webhook store-aware signature and reply", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    verifyLineSignatureMock.mockReturnValue(true);
    replyMessageMock.mockResolvedValue({ success: true });
    verifySteamButlerLineSignatureMock.mockReturnValue(false);
    replySteamButlerMessageMock.mockResolvedValue({ success: true });
    bindLineToCustomerInStoreMock.mockReset();
    probeStoreLineRecipientMock.mockReset();
    captureLineRebindCandidateMock.mockReset();
    captureLineRebindCandidateMock.mockResolvedValue({ status: "not_eligible" });
    digitalButlerHandleTextMock.mockReset();
    digitalButlerHandleTextMock.mockResolvedValue({
      handled: false,
      messages: [],
      outcome: "NO_MATCH",
    });
    digitalButlerDeliverReplyIfActiveMock.mockReset();
    digitalButlerDeliverReplyIfActiveMock.mockImplementation(async (_storeId, _conversationId, deliver) => {
      await deliver();
      return true;
    });
    mockPrisma.store.findFirst.mockResolvedValue({ id: "store-hsinchu" });
    mockPrisma.customer.findMany.mockResolvedValue([]);
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("sanitizes an invisible Digital Butler quick reply carrier and logs a safe failed reply diagnostic", async () => {
    digitalButlerHandleTextMock.mockResolvedValueOnce({
      handled: true,
      outcome: "WAITING_INPUT",
      messages: [
        { type: "text", text: "歡迎來到暖暖蒸足竹北店！" },
        {
          type: "text",
          text: "\u200B",
          choices: [{ label: "我想預約體驗", value: "我想預約體驗" }],
        },
      ],
      replyGuard: undefined,
    });
    replyMessageMock.mockResolvedValueOnce({
      success: false,
      error: "LINE API response includes sensitive detail",
      httpStatus: 400,
      errorType: "line_api_rejected",
    });
    const body = {
      destination: "D_hsinchu",
      events: [{
        type: "message",
        replyToken: "reply-token-sensitive",
        source: { type: "user", userId: "U_hsinchu_customer" },
        message: { type: "text", id: "message-trigger", text: "我想了解蒸足" },
        timestamp: 1_721_234_567_890,
      }],
    };

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq(body));

    expect(res.status).toBe(200);
    expect(replyMessageMock).toHaveBeenCalledWith("store-hsinchu", "reply-token-sensitive", [{
      type: "text",
      text: "歡迎來到暖暖蒸足竹北店！",
      quickReply: expect.any(Object),
    }]);
    const diagnostics = consoleErrorSpy.mock.calls
      .map((call: unknown[]) => {
        const [message] = call;
        return typeof message === "string" ? JSON.parse(message) as Record<string, unknown> : null;
      })
      .find((entry: Record<string, unknown> | null) => entry?.event === "digital_butler_reply");
    expect(diagnostics).toEqual({
      event: "digital_butler_reply",
      storeId: "store-hsinchu",
      outcome: "WAITING_INPUT",
      messageCount: 1,
      hasQuickReply: true,
      success: false,
      httpStatus: 400,
      errorType: "line_api_rejected",
    });
    const output = JSON.stringify(consoleErrorSpy.mock.calls);
    expect(output).not.toContain("reply-token-sensitive");
    expect(output).not.toContain("LINE API response includes sensitive detail");
    expect(output).not.toContain("我想了解蒸足");
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

  it("updates only the store recipient when the customer already has a central User", async () => {
    probeStoreLineRecipientMock.mockResolvedValue({ status: "INCOMPATIBLE" });
    mockPrisma.customer.findMany.mockResolvedValue([{
      id: "customer-hsinchu",
      lineUserId: "U-central-login",
      userId: "central-user",
    }]);
    mockPrisma.customer.updateMany.mockResolvedValueOnce({ count: 1 });

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq({
      destination: "D_hsinchu",
      events: [{
        type: "message",
        replyToken: "reply-token-phone",
        source: { type: "user", userId: "U-hsinchu-store" },
        message: { type: "text", id: "message-1", text: "0912345678" },
        timestamp: 1_721_234_567_890,
      }],
    }));

    expect(res.status).toBe(200);
    expect(probeStoreLineRecipientMock).toHaveBeenCalledWith(
      "store-hsinchu",
      "U-central-login",
    );
    expect(bindLineToCustomerInStoreMock).not.toHaveBeenCalled();
    expect(mockPrisma.customer.updateMany).toHaveBeenCalledWith({
      where: {
        id: "customer-hsinchu",
        storeId: "store-hsinchu",
        phone: "0912345678",
        lineUserId: "U-central-login",
        mergedIntoCustomerId: null,
      },
      data: {
        lineUserId: "U-hsinchu-store",
        lineLinkStatus: "LINKED",
        lineLinkedAt: expect.any(Date),
      },
    });
    expect(replyMessageMock).toHaveBeenCalledWith(
      "store-hsinchu",
      "reply-token-phone",
      [{ type: "text", text: "通知設定完成！之後您將可收到預約提醒與方案通知。若尚未註冊蒸管家，可繼續完成會員註冊。" }],
    );
  });

  it("returns a reviewable message when the new LINE identity belongs to another same-store customer", async () => {
    probeStoreLineRecipientMock.mockResolvedValue({ status: "INCOMPATIBLE" });
    mockPrisma.customer.findMany.mockResolvedValue([{
      id: "customer-hsinchu",
      lineUserId: "U-central-login",
      userId: "central-user",
    }]);
    mockPrisma.customer.updateMany.mockRejectedValueOnce({
      code: "P2002",
      meta: { target: ["storeId", "lineUserId"] },
    });

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq({
      destination: "D_hsinchu",
      events: [{
        type: "message",
        replyToken: "reply-token-phone",
        source: { type: "user", userId: "U-already-used" },
        message: { type: "text", id: "message-conflict", text: "0912345678" },
        timestamp: 1_721_234_567_890,
      }],
    }));

    expect(res.status).toBe(200);
    expect(replyMessageMock).toHaveBeenCalledWith(
      "store-hsinchu",
      "reply-token-phone",
      [{ type: "text", text: "此 LINE 已綁定其他顧客資料，請由店長確認解除或合併。" }],
    );
    expect(captureLineRebindCandidateMock).toHaveBeenCalledWith({
      storeId: "store-hsinchu",
      customerId: "customer-hsinchu",
      normalizedPhone: "0912345678",
      lineUserId: "U-already-used",
      webhookEventKey: "test:message-conflict",
      eventTimestamp: new Date(1_721_234_567_890),
    });
  });

  it("continues an active Digital Butler flow after synchronizing phone binding", async () => {
    digitalButlerHandleTextMock.mockResolvedValueOnce({
      handled: true,
      messages: [{ type: "text", text: "請問您想了解哪一項服務？" }],
      outcome: "WAITING_INPUT",
    });
    mockPrisma.customer.findMany.mockResolvedValueOnce([{
      id: "customer-hsinchu",
      userId: null,
      lineUserId: null,
    }]);
    mockPrisma.customer.updateMany.mockResolvedValueOnce({ count: 1 });

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq({
      destination: "D_hsinchu",
      events: [{
        type: "message",
        replyToken: "reply-token-phone",
        source: { type: "user", userId: "U-hsinchu-store" },
        message: { type: "text", id: "message-phone-answer", text: "0912345678" },
        timestamp: 1_721_234_567_890,
      }],
    }));

    expect(res.status).toBe(200);
    expect(digitalButlerHandleTextMock).toHaveBeenCalledWith({
      storeId: "store-hsinchu",
      provider: "LINE",
      channelAccountId: "D_hsinchu",
      senderId: "U-hsinchu-store",
      text: "0912345678",
      webhookEventId: undefined,
      messageId: "message-phone-answer",
      occurredAt: new Date(1_721_234_567_890),
    });
    expect(bindLineToCustomerInStoreMock).not.toHaveBeenCalled();
    expect(replyMessageMock).toHaveBeenCalledTimes(1);
    expect(replyMessageMock).toHaveBeenCalledWith(
      "store-hsinchu",
      "reply-token-phone",
      [{ type: "text", text: "請問您想了解哪一項服務？" }],
    );
  });

  it("drops an already-prepared active-flow reply after cancellation wins the outbound guard", async () => {
    digitalButlerHandleTextMock.mockResolvedValueOnce({
      handled: true,
      messages: [{ type: "text", text: "舊的下一題" }],
      outcome: "WAITING_INPUT",
      replyGuard: { conversationId: "conversation-1", requiresActiveConversation: true },
    });
    digitalButlerDeliverReplyIfActiveMock.mockResolvedValueOnce(false);
    const body = {
      destination: "D_hsinchu",
      events: [{
        type: "message",
        replyToken: "reply-token-old-question",
        source: { userId: "U-hsinchu-store" },
        message: { id: "message-old-question", type: "text", text: "繼續" },
        timestamp: 1_721_234_567_890,
      }],
    };

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq(body));

    expect(res.status).toBe(200);
    expect(digitalButlerDeliverReplyIfActiveMock).toHaveBeenCalledWith(
      "store-hsinchu",
      "conversation-1",
      expect.any(Function),
    );
    expect(replyMessageMock).not.toHaveBeenCalled();
  });

  it("sends a successful cancellation acknowledgement once without applying the active-flow reply guard", async () => {
    digitalButlerHandleTextMock.mockResolvedValueOnce({
      handled: true,
      messages: [{ type: "text", text: "好的，已停止目前流程。" }],
      outcome: "CANCELLED_BY_USER",
    });
    const body = {
      destination: "D_hsinchu",
      events: [{
        type: "message",
        replyToken: "reply-token-cancel",
        source: { userId: "U-hsinchu-store" },
        message: { id: "message-cancel", type: "text", text: "停" },
        timestamp: 1_721_234_567_890,
      }],
    };

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq(body));

    expect(res.status).toBe(200);
    expect(digitalButlerDeliverReplyIfActiveMock).not.toHaveBeenCalled();
    expect(replyMessageMock).toHaveBeenCalledTimes(1);
    expect(replyMessageMock).toHaveBeenCalledWith(
      "store-hsinchu",
      "reply-token-cancel",
      [{ type: "text", text: "好的，已停止目前流程。" }],
    );
  });

  it("keeps standalone phone binding behavior when Digital Butler does not handle the message", async () => {
    digitalButlerHandleTextMock.mockResolvedValueOnce({
      handled: false,
      messages: [],
      outcome: "NO_MATCH",
    });
    mockPrisma.customer.findMany.mockResolvedValueOnce([{
      id: "customer-hsinchu",
      userId: null,
      lineUserId: null,
    }]);
    mockPrisma.customer.updateMany.mockResolvedValueOnce({ count: 1 });

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq({
      destination: "D_hsinchu",
      events: [{
        type: "message",
        replyToken: "reply-token-phone",
        source: { type: "user", userId: "U-hsinchu-store" },
        message: { type: "text", id: "message-standalone-phone", text: "0912345678" },
        timestamp: 1_721_234_567_890,
      }],
    }));

    expect(res.status).toBe(200);
    expect(replyMessageMock).toHaveBeenCalledTimes(1);
    expect(replyMessageMock).toHaveBeenCalledWith(
      "store-hsinchu",
      "reply-token-phone",
      [{ type: "text", text: "通知設定完成！之後您將可收到預約提醒與方案通知。若尚未註冊蒸管家，可繼續完成會員註冊。" }],
    );
  });

  it("binds an unregistered customer without creating a login User or Account", async () => {
    mockPrisma.customer.findMany.mockResolvedValueOnce([{
      id: "customer-hsinchu",
      userId: null,
      lineUserId: null,
    }]);
    mockPrisma.customer.updateMany.mockResolvedValueOnce({ count: 1 });

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq({
      destination: "D_hsinchu",
      events: [{
        type: "message",
        replyToken: "reply-token-phone",
        source: { type: "user", userId: "U-hsinchu-store" },
        message: { type: "text", id: "message-1", text: "0912345678" },
        timestamp: 1_721_234_567_890,
      }],
    }));

    expect(res.status).toBe(200);
    expect(bindLineToCustomerInStoreMock).not.toHaveBeenCalled();
    expect(mockPrisma.customer.findMany).toHaveBeenCalledWith({
      where: {
        storeId: "store-hsinchu",
        phone: "0912345678",
        mergedIntoCustomerId: null,
      },
      select: { id: true, userId: true, lineUserId: true },
      take: 2,
    });
    expect(mockPrisma.customer.updateMany).toHaveBeenCalledWith({
      where: {
        id: "customer-hsinchu",
        storeId: "store-hsinchu",
        phone: "0912345678",
        lineUserId: null,
        mergedIntoCustomerId: null,
      },
      data: {
        lineUserId: "U-hsinchu-store",
        lineLinkStatus: "LINKED",
        lineLinkedAt: expect.any(Date),
      },
    });
    expect(replyMessageMock).toHaveBeenCalledWith(
      "store-hsinchu",
      "reply-token-phone",
      [{ type: "text", text: "通知設定完成！之後您將可收到預約提醒與方案通知。若尚未註冊蒸管家，可繼續完成會員註冊。" }],
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
    vi.stubEnv("STEAM_BUTLER_LINE_CHANNEL_SECRET", "brand-secret-value");
    vi.stubEnv("STEAM_BUTLER_LINE_CHANNEL_ACCESS_TOKEN", "brand-access-token-value");
    verifySteamButlerLineSignatureMock.mockReturnValueOnce(true);
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
    expect(brandLogEvents()).toEqual(expect.arrayContaining([
      { event: "brand_line_destination_matched" },
      { event: "brand_line_signature_valid" },
      { event: "brand_line_text_received", textLength: "找到適合方案".length },
      { event: "brand_line_command_matched", command: "show_plan" },
      { event: "brand_line_reply_attempted" },
      { event: "brand_line_reply_success" },
    ]));

    const logs = JSON.stringify(brandLogEvents());
    expect(logs).not.toContain("D_brand_support");
    expect(logs).not.toContain("reply-token-brand-plan");
    expect(logs).not.toContain("找到適合方案");
    expect(logs).not.toContain("brand-secret-value");
    expect(logs).not.toContain("brand-access-token-value");
  });

  it("falls back to the existing Store flow when the brand signature is invalid", async () => {
    vi.stubEnv("STEAM_BUTLER_LINE_DESTINATION", "D_brand_support");
    const body = {
      destination: "D_hsinchu",
      events: [{
        type: "follow",
        replyToken: "reply-token",
        source: { type: "user", userId: "U_hsinchu_customer" },
      }],
    };

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq(body, "store-signature"));

    expect(res.status).toBe(200);
    expect(mockPrisma.store.findFirst).toHaveBeenCalledWith({
      where: { lineDestination: "D_hsinchu" },
      select: { id: true },
    });
    expect(verifyLineSignatureMock).toHaveBeenCalledWith(
      "store-hsinchu",
      JSON.stringify(body),
      "store-signature",
    );
    expect(replySteamButlerMessageMock).not.toHaveBeenCalled();
  });

  it("handles a valid brand signature even when destination does not match", async () => {
    vi.stubEnv("STEAM_BUTLER_LINE_DESTINATION", "D_brand_support");
    verifySteamButlerLineSignatureMock.mockReturnValueOnce(true);
    const body = {
      destination: "D_stale_brand_destination",
      events: [{
        type: "message",
        replyToken: "reply-token-brand-plan",
        message: { type: "text", text: "找到適合方案" },
      }],
    };

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq(body, "brand-signature"));

    expect(res.status).toBe(200);
    expect(mockPrisma.store.findFirst).not.toHaveBeenCalled();
    expect(replySteamButlerMessageMock).toHaveBeenCalledOnce();
    expect(brandLogEvents()).toEqual(expect.arrayContaining([
      { event: "brand_line_signature_valid" },
      { event: "brand_line_destination_mismatch", destination: "masked" },
      { event: "brand_line_command_matched", command: "show_plan" },
      { event: "brand_line_reply_success" },
    ]));
    expect(JSON.stringify(brandLogEvents())).not.toContain("D_stale_brand_destination");
  });

  it("does not reply to non-whitelisted brand text", async () => {
    vi.stubEnv("STEAM_BUTLER_LINE_DESTINATION", "D_brand_support");
    verifySteamButlerLineSignatureMock.mockReturnValueOnce(true);
    const body = {
      destination: "D_brand_support",
      events: [{ type: "message", replyToken: "reply-token", message: { type: "text", text: "其他文字" } }],
    };

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq(body));

    expect(res.status).toBe(200);
    expect(mockPrisma.store.findFirst).not.toHaveBeenCalled();
    expect(replySteamButlerMessageMock).not.toHaveBeenCalled();
    expect(brandLogEvents()).toEqual(expect.arrayContaining([
      { event: "brand_line_text_received", textLength: "其他文字".length },
      { event: "brand_line_command_ignored" },
    ]));
    expect(JSON.stringify(brandLogEvents())).not.toContain("其他文字");
  });

  it("logs only sanitized status and error type when a brand reply fails", async () => {
    vi.stubEnv("STEAM_BUTLER_LINE_DESTINATION", "D_brand_support");
    verifySteamButlerLineSignatureMock.mockReturnValueOnce(true);
    replySteamButlerMessageMock.mockResolvedValueOnce({
      success: false,
      error: "sensitive upstream response body",
      httpStatus: 401,
      errorType: "line_api_rejected",
    });
    const body = {
      destination: "D_brand_support",
      events: [{
        type: "message",
        replyToken: "reply-token-brand-plan",
        message: { type: "text", text: "找到適合方案" },
      }],
    };

    const { POST } = await import("@/app/api/line/webhook/route");
    const res = await POST(postReq(body));

    expect(res.status).toBe(200);
    expect(brandLogEvents()).toContainEqual({
      event: "brand_line_reply_failed",
      httpStatus: 401,
      errorType: "line_api_rejected",
    });
    const logs = JSON.stringify(brandLogEvents());
    expect(logs).not.toContain("sensitive upstream response body");
    expect(logs).not.toContain("D_brand_support");
    expect(logs).not.toContain("reply-token-brand-plan");
    expect(logs).not.toContain("找到適合方案");
  });

  it("returns 200 for signed brand verification events without querying a Store", async () => {
    vi.stubEnv("STEAM_BUTLER_LINE_DESTINATION", "D_brand_support");
    verifySteamButlerLineSignatureMock.mockReturnValueOnce(true);
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
