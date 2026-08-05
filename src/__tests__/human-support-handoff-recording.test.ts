import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  conversationFindFirst: vi.fn(),
  leadUpsert: vi.fn(),
  executionLogCreate: vi.fn(),
  storeFindUnique: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/lib/line", () => ({ getUserProfile: mocks.getUserProfile }));
vi.mock("@/lib/digital-butler-crypto", () => ({
  hashDigitalButlerSensitiveValue: () => "0123456789abcdef",
  encryptDigitalButlerValue: () => ({
    ciphertext: Buffer.from("encrypted"),
    iv: Buffer.from("123456789012"),
    authTag: Buffer.from("1234567890123456"),
  }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    digitalButlerConversation: { findFirst: mocks.conversationFindFirst },
    digitalButlerLead: { upsert: mocks.leadUpsert },
    digitalButlerExecutionLog: {
      create: mocks.executionLogCreate,
      delete: vi.fn(),
      update: vi.fn(),
    },
    store: { findUnique: mocks.storeFindUnique },
  },
}));
vi.mock("@/server/services/store-manager-line-notifications", () => ({
  notifyStoreManagerOnLine: mocks.notify,
}));

import { recordHumanSupportHandoff } from "@/server/services/human-support-handoff";

const input = {
  storeId: "store-a",
  provider: "LINE" as const,
  channelAccountId: "channel-a",
  senderId: "line-user-a",
  messageId: "message-a",
  occurredAt: new Date("2026-08-05T01:02:03.000Z"),
  text: " 我想找真人客服 ",
};

describe("recordHumanSupportHandoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.conversationFindFirst.mockResolvedValue({ id: "conversation-a", flowId: "flow-a" });
    mocks.leadUpsert.mockResolvedValue({ id: "lead-a" });
    mocks.executionLogCreate.mockResolvedValue(null);
  });

  it("creates the support lead even when optional LINE profile enrichment throws", async () => {
    mocks.getUserProfile.mockRejectedValue(new Error("LINE temporarily unavailable"));

    await recordHumanSupportHandoff(input);

    expect(mocks.leadUpsert).toHaveBeenCalledOnce();
    expect(mocks.leadUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        customerDisplayName: null,
        customerAvatarUrl: null,
        lastMessageAt: input.occurredAt,
      }),
    }));
  });

  it("preserves an existing profile when LINE returns an error-shaped blank profile", async () => {
    mocks.getUserProfile.mockResolvedValue({
      displayName: "",
      error: "LINE_TOKEN_NOT_CONFIGURED",
    });

    await recordHumanSupportHandoff(input);

    const call = mocks.leadUpsert.mock.calls[0][0];
    expect(call.update).not.toHaveProperty("customerDisplayName");
    expect(call.update).not.toHaveProperty("customerAvatarUrl");
    expect(call.create).toEqual(expect.objectContaining({
      customerDisplayName: null,
      customerAvatarUrl: null,
    }));
  });

  it("refreshes the encrypted message snapshot and timestamp on an existing lead", async () => {
    mocks.getUserProfile.mockResolvedValue(null);

    await recordHumanSupportHandoff(input);

    const call = mocks.leadUpsert.mock.calls[0][0];
    expect(call.update).toEqual(expect.objectContaining({
      lastMessageCiphertext: expect.any(Uint8Array),
      lastMessageIv: expect.any(Uint8Array),
      lastMessageAuthTag: expect.any(Uint8Array),
      lastMessageAt: input.occurredAt,
    }));
    expect(call.update).not.toHaveProperty("customerDisplayName");
    expect(call.update).not.toHaveProperty("customerAvatarUrl");
  });
});
