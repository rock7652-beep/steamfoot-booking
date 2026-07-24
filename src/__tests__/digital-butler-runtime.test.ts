import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/digital-butler-entitlement", () => ({
  requireDigitalButlerConversationActivation: vi.fn(),
}));

import { DigitalButlerRuntime } from "@/server/services/digital-butler-runtime";

const textStep = (id: string, stepKey: string, position: number, text: string) => ({
  id, stepKey, position, type: "TEXT" as const, config: { text }, required: false,
});
const questionStep = (id: string, stepKey: string, position: number) => ({
  id, stepKey, position, type: "FREE_TEXT" as const,
  config: { prompt: "請告訴我們您的需求" }, required: true,
});

const repository = {
  claimEvent: vi.fn(async () => true),
  setEventOutcome: vi.fn(async () => undefined),
  findActiveConversation: vi.fn(),
  expireConversation: vi.fn(async () => undefined),
  findTriggeredFlow: vi.fn(),
  createConversation: vi.fn(),
  saveAnswer: vi.fn(async () => undefined),
  advanceConversation: vi.fn(async () => undefined),
  createLead: vi.fn(async () => undefined),
};
const gate = vi.fn(async () => undefined);

const input = {
  storeId: "store-hsinchu",
  channelIdentity: "destination-hsinchu",
  lineUserId: "U1234567890abcdef1234567890abcdef",
  text: "我想了解適合我的方案",
  webhookEventId: "event-1",
  timestamp: 1_753_000_000_000,
  messageId: "message-1",
};

describe("DigitalButlerRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DIGITAL_BUTLER_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64url");
    repository.claimEvent.mockResolvedValue(true);
    repository.findActiveConversation.mockResolvedValue(null);
  });

  it("starts only a published triggered flow and stops at the first question", async () => {
    const steps = [
      textStep("step-1", "opening", 0, "真人管家會協助您"),
      questionStep("step-2", "need", 1),
    ];
    repository.findTriggeredFlow.mockResolvedValue({
      id: "flow-1",
      currentPublishedVersionId: "version-1",
      publishedVersion: { definition: { trigger: { keywords: [input.text] } }, steps },
    });
    repository.createConversation.mockResolvedValue({
      id: "conversation-1", storeId: input.storeId, flowId: "flow-1",
      flowVersionId: "version-1", currentStepKey: "opening",
      expiresAt: new Date(Date.now() + 60_000),
      flowVersion: { steps }, answers: [],
    });

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(input);

    expect(result).toMatchObject({ handled: true, outcome: "WAITING_INPUT" });
    expect(result.messages).toEqual([
      { type: "text", text: "真人管家會協助您" },
      { type: "text", text: "請告訴我們您的需求" },
    ]);
    expect(repository.createConversation).toHaveBeenCalledWith(expect.objectContaining({
      storeId: input.storeId,
      channelIdentity: input.channelIdentity,
      lineUserIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(repository.advanceConversation).toHaveBeenCalledWith(expect.objectContaining({
      currentStepKey: "need", status: "WAITING_INPUT",
    }));
  });

  it("deduplicates a LINE redelivery before reading or advancing a conversation", async () => {
    repository.claimEvent.mockResolvedValue(false);

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(input);

    expect(result).toEqual({ handled: true, messages: [], outcome: "DUPLICATE" });
    expect(gate).not.toHaveBeenCalled();
    expect(repository.findActiveConversation).not.toHaveBeenCalled();
  });

  it("fails closed when entitlement or the store activation flag is disabled", async () => {
    gate.mockRejectedValueOnce(new Error("FORBIDDEN"));

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(input);

    expect(result).toEqual({ handled: false, messages: [], outcome: "INACTIVE" });
    expect(repository.findTriggeredFlow).not.toHaveBeenCalled();
    expect(repository.setEventOutcome).toHaveBeenCalledWith(
      input.storeId, `line:${input.webhookEventId}`, "INACTIVE", undefined,
    );
  });

  it("stores an answer and executes lead/completion actions exactly once", async () => {
    const steps = [
      questionStep("step-1", "need", 0),
      { id: "step-2", stepKey: "create-lead", position: 1, type: "CREATE_LEAD" as const, config: {}, required: false },
      textStep("step-3", "thanks", 2, "謝謝，我們會盡快聯繫您"),
      { id: "step-4", stepKey: "complete", position: 3, type: "COMPLETE_FLOW" as const, config: {}, required: false },
    ];
    repository.findActiveConversation.mockResolvedValue({
      id: "conversation-1", storeId: input.storeId, flowId: "flow-1",
      flowVersionId: "version-1", currentStepKey: "need",
      expiresAt: new Date(Date.now() + 60_000),
      flowVersion: { steps }, answers: [],
    });

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText({
      ...input, text: "增加新客",
    });

    expect(repository.saveAnswer).toHaveBeenCalledWith(expect.objectContaining({
      storeId: input.storeId, conversationId: "conversation-1", value: "增加新客",
    }));
    expect(repository.createLead).toHaveBeenCalledTimes(1);
    expect(repository.createLead).toHaveBeenCalledWith(expect.objectContaining({
      completionActionKey: "create-lead",
      submittedAnswers: { need: "增加新客" },
    }));
    expect(repository.advanceConversation).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "COMPLETED", currentStepKey: null,
    }));
    expect(result).toEqual({
      handled: true,
      messages: [{ type: "text", text: "謝謝，我們會盡快聯繫您" }],
      outcome: "COMPLETED",
    });
  });

  it("expires stale conversations and allows a fresh trigger lookup", async () => {
    repository.findActiveConversation.mockResolvedValue({
      id: "stale", storeId: input.storeId, flowId: "flow-old",
      flowVersionId: "version-old", currentStepKey: "need",
      expiresAt: new Date(Date.now() - 1),
      flowVersion: { steps: [] }, answers: [],
    });
    repository.findTriggeredFlow.mockResolvedValue(null);

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(input);

    expect(repository.expireConversation).toHaveBeenCalledWith(input.storeId, "stale");
    expect(repository.findTriggeredFlow).toHaveBeenCalledWith(input.storeId, input.text);
    expect(result).toMatchObject({ handled: false, outcome: "NO_MATCH" });
  });
});
