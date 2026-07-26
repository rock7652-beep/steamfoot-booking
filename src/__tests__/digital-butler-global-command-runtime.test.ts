import { beforeEach, describe, expect, it, vi } from "vitest";
import { DigitalButlerRuntime } from "@/server/services/digital-butler-runtime";

const phoneStep = {
  id: "step-phone",
  stepKey: "phone",
  position: 0,
  type: "TAIWAN_MOBILE" as const,
  config: { text: "請輸入手機" },
  required: true,
};
const menuStep = {
  id: "step-menu",
  stepKey: "menu",
  position: 0,
  type: "SINGLE_CHOICE" as const,
  config: {
    text: "請選擇服務",
    options: [
      { label: "了解蒸足", value: "learn" },
      { label: "預約體驗", value: "book" },
    ],
  },
  required: true,
};

type TestStep = typeof phoneStep | typeof menuStep;

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
  cancelConversation: vi.fn(async () => undefined),
  resetConversation: vi.fn(async () => undefined),
  findTriggeredFlow: vi.fn(),
  createConversation: vi.fn(),
  saveAnswer: vi.fn(async () => undefined),
  advanceConversation: vi.fn(async () => undefined),
  createLead: vi.fn(async () => undefined),
};
const gate = vi.fn(async () => undefined);

function input(text: string, event: string) {
  return {
    storeId: "store-zhubei",
    channelIdentity: "destination-zhubei",
    lineUserId: "U1234567890abcdef1234567890abcdef",
    text,
    webhookEventId: event,
    timestamp: 1_753_000_000_000,
    messageId: event,
  };
}

describe("Digital Butler global command runtime priority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("restarts from the first step, clears old answers, and asks the first question again", async () => {
    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(
      input("重新開始", "event-restart"),
    );

    expect(repository.resetConversation).toHaveBeenCalledWith(
      "store-zhubei",
      "conversation-1",
      "phone",
    );
    expect(repository.advanceConversation).toHaveBeenCalledWith(expect.objectContaining({
      storeId: "store-zhubei",
      conversationId: "conversation-1",
      currentStepKey: "phone",
      status: "WAITING_INPUT",
    }));
    expect(repository.saveAnswer).not.toHaveBeenCalled();
    expect(result).toMatchObject({ outcome: "FLOW_RESTARTED" });
    expect(result.messages).toEqual([{ type: "text", text: "請輸入手機" }]);
  });

  it("returns to a named menu step and does not create a lead from stale answers", async () => {
    const conversation = activeConversation([
      { ...phoneStep, position: 0 },
      { ...menuStep, position: 1 },
    ]);
    conversation.currentStepKey = "phone";
    repository.findActiveConversation.mockResolvedValue(conversation);

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(
      input("回主選單", "event-menu"),
    );

    expect(repository.resetConversation).toHaveBeenCalledWith(
      "store-zhubei",
      "conversation-1",
      "menu",
    );
    expect(repository.createLead).not.toHaveBeenCalled();
    expect(result.outcome).toBe("MAIN_MENU_RESTARTED");
    expect(result.messages[0]).toMatchObject({ type: "text", text: "請選擇服務" });
  });

  it("keeps idempotency: a redelivered command does not cancel twice", async () => {
    repository.claimEvent.mockResolvedValue(false);

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(
      input("停", "event-duplicate"),
    );

    expect(result).toEqual({ handled: true, messages: [], outcome: "DUPLICATE" });
    expect(repository.cancelConversation).not.toHaveBeenCalled();
    expect(repository.resetConversation).not.toHaveBeenCalled();
  });
});
