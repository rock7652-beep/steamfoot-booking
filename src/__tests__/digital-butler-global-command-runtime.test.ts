import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/digital-butler-entitlement", () => ({
  requireDigitalButlerConversationActivation: vi.fn(),
}));

import { DigitalButlerRuntime } from "@/server/services/digital-butler-runtime";

const phoneStep = {
  id: "step-phone",
  stepKey: "phone",
  position: 0,
  type: "TAIWAN_MOBILE" as const,
  config: { text: "請輸入手機" },
  required: true,
};
type TestStep = typeof phoneStep;

function activeConversation(steps: TestStep[] = [phoneStep]) {
  return {
    id: "conversation-1",
    storeId: "store-zhubei",
    flowId: "flow-1",
    flowVersionId: "version-1",
    currentStepKey: steps[0]?.stepKey ?? null,
    expiresAt: new Date(Date.now() + 60_000),
    flowVersion: { steps },
    answers: [{ step: { stepKey: "old-answer" }, value: "舊資料" }],
  };
}

const repository = {
  claimEvent: vi.fn(async () => true),
  setEventOutcome: vi.fn(async () => undefined),
  findActiveConversation: vi.fn(),
  expireConversation: vi.fn(async () => undefined),
  cancelConversation: vi.fn(async () => true),
  findTriggeredFlow: vi.fn(),
  createConversation: vi.fn(),
  saveAnswer: vi.fn(async () => true),
  advanceConversation: vi.fn(async () => true),
  createLead: vi.fn(async () => true),
  deliverReplyIfActive: vi.fn(async (_storeId: string, _conversationId: string, deliver: () => Promise<void>) => {
    await deliver();
    return true;
  }),
};
const gate = vi.fn(async () => undefined);

function input(text: string, event: string) {
  return {
    storeId: "store-zhubei",
    provider: "LINE" as const,
    channelAccountId: "destination-zhubei",
    senderId: "U1234567890abcdef1234567890abcdef",
    text,
    webhookEventId: event,
    occurredAt: new Date(1_753_000_000_000),
    messageId: event,
  };
}

describe("Digital Butler global command runtime priority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DIGITAL_BUTLER_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64url");
    repository.claimEvent.mockResolvedValue(true);
    repository.findActiveConversation.mockResolvedValue(activeConversation());
  });

  it("cancels before Taiwan-mobile validation and persists a store-scoped cancellation", async () => {
    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(
      input("停", "event-cancel"),
    );

    expect(repository.cancelConversation).toHaveBeenCalledWith("store-zhubei", "conversation-1");
    expect(repository.saveAnswer).not.toHaveBeenCalled();
    expect(result.outcome).toBe("CANCELLED_BY_USER");
    expect(result.messages[0]).toMatchObject({ type: "text", text: expect.stringContaining("已停止") });
  });

  it("records a handoff request without validating or saving the current field", async () => {
    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(
      input("轉接客服", "event-handoff"),
    );

    expect(repository.cancelConversation).toHaveBeenCalledWith("store-zhubei", "conversation-1");
    expect(repository.saveAnswer).not.toHaveBeenCalled();
    expect(result.outcome).toBe("HANDOFF_REQUESTED");
    expect(result.messages[0]).toMatchObject({ type: "text", text: expect.stringContaining("門市夥伴") });
  });

  it("does not pretend to cancel when another webhook has already ended the conversation", async () => {
    repository.cancelConversation.mockResolvedValueOnce(false);

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(
      input("停", "event-already-ended-cancel"),
    );

    expect(repository.cancelConversation).toHaveBeenCalledWith("store-zhubei", "conversation-1");
    expect(result).toEqual({ handled: true, messages: [], outcome: "INACTIVE_CONVERSATION" });
  });

  it("does not pretend to hand off when another webhook has already ended the conversation", async () => {
    repository.cancelConversation.mockResolvedValueOnce(false);

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(
      input("轉接客服", "event-already-ended-handoff"),
    );

    expect(repository.cancelConversation).toHaveBeenCalledWith("store-zhubei", "conversation-1");
    expect(result).toEqual({ handled: true, messages: [], outcome: "INACTIVE_CONVERSATION" });
  });

  it("stops a concurrent answer after cancellation before it can advance or create a lead", async () => {
    repository.saveAnswer.mockResolvedValueOnce(false);

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(
      input("0912345678", "event-answer-after-cancel"),
    );

    expect(repository.saveAnswer).toHaveBeenCalledWith(expect.objectContaining({
      storeId: "store-zhubei",
      conversationId: "conversation-1",
    }));
    expect(repository.advanceConversation).not.toHaveBeenCalled();
    expect(repository.createLead).not.toHaveBeenCalled();
    expect(result).toEqual({ handled: true, messages: [], outcome: "INACTIVE_CONVERSATION" });
  });

  it("keeps idempotency: a redelivered command does not cancel twice", async () => {
    repository.claimEvent.mockResolvedValue(false);

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(
      input("停", "event-duplicate"),
    );

    expect(result).toEqual({ handled: true, messages: [], outcome: "DUPLICATE" });
    expect(repository.cancelConversation).not.toHaveBeenCalled();
  });
});
