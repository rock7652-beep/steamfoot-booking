import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/digital-butler-entitlement", () => ({
  requireDigitalButlerConversationActivation: vi.fn(),
}));

import {
  DigitalButlerRuntime,
  matchesDigitalButlerTriggerKeyword,
  topLevelChoiceEntryStepKey,
} from "@/server/services/digital-butler-runtime";

const textStep = (id: string, stepKey: string, position: number, text: string) => ({
  id, stepKey, position, type: "TEXT" as const, config: { text }, required: false,
});
const questionStep = (id: string, stepKey: string, position: number) => ({
  id, stepKey, position, type: "FREE_TEXT" as const,
  config: { prompt: "請告訴我們您的需求" }, required: true,
});
const mobileStep = (id: string, stepKey: string, position: number) => ({
  id, stepKey, position, type: "TAIWAN_MOBILE" as const,
  config: { prompt: "請輸入 09 開頭的手機號碼" }, required: true,
});

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

const input = {
  storeId: "store-hsinchu",
  provider: "LINE" as const,
  channelAccountId: "destination-hsinchu",
  senderId: "U1234567890abcdef1234567890abcdef",
  text: "我想了解適合我的方案",
  webhookEventId: "event-1",
  occurredAt: new Date(1_753_000_000_000),
  messageId: "message-1",
};

describe("DigitalButlerRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DIGITAL_BUTLER_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64url");
    repository.claimEvent.mockResolvedValue(true);
    repository.findActiveConversation.mockResolvedValue(null);
  });

  it("only treats the first choice step as a fresh conversation entry point", () => {
    const steps = [
      {
        id: "menu", stepKey: "menu", position: 0, type: "SINGLE_CHOICE" as const,
        config: {
          options: [{ label: "我想預約體驗", value: "booking", nextStepKey: "name" }],
        },
        required: true,
      },
      {
        id: "later", stepKey: "later", position: 1, type: "SINGLE_CHOICE" as const,
        config: {
          options: [{ label: "下午", value: "afternoon", nextStepKey: "phone" }],
        },
        required: true,
      },
    ];

    expect(topLevelChoiceEntryStepKey(steps, "我想預約體驗")).toBe("name");
    expect(topLevelChoiceEntryStepKey(steps, "booking")).toBe("name");
    expect(topLevelChoiceEntryStepKey(steps, "下午")).toBeNull();
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
      startStepKey: null,
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
      provider: "LINE",
      channelAccountId: input.channelAccountId,
      senderIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      senderIdCiphertext: expect.any(Uint8Array),
      senderIdKeyVersion: "v1",
    }));
    expect(repository.advanceConversation).toHaveBeenCalledWith(expect.objectContaining({
      currentStepKey: "need", status: "WAITING_INPUT",
    }));
  });

  it.each([
    "我想體驗蒸足",
    "我想預約蒸足",
    "我想預約體驗蒸足！",
    " 我 想 了解 蒸 足 ",
  ])("accepts a safe trial-experience trigger alias: %s", async (text) => {
    expect(matchesDigitalButlerTriggerKeyword(["我想了解蒸足"], text)).toBe(true);
  });

  it("does not apply trial aliases to unrelated published flows", () => {
    expect(matchesDigitalButlerTriggerKeyword(["我想了解課程"], "我想體驗蒸足")).toBe(false);
  });

  it.each(["LINE", "MESSENGER"] as const)("sends the direct booking entry and ends an active %s conversation for the trial intent", async (provider) => {
    const steps = [
      {
        id: "menu", stepKey: "menu", position: 0, type: "SINGLE_CHOICE" as const,
        config: {
          text: "請選擇：",
          options: [
            { label: "我想預約體驗", value: "BOOKING", nextStepKey: "name" },
            { label: "蒸足如何進行", value: "PROCESS", nextStepKey: "process" },
          ],
        },
        required: true,
      },
      questionStep("name", "name", 1),
    ];
    repository.findActiveConversation.mockResolvedValue({
      id: "conversation-menu", storeId: input.storeId, flowId: "flow-1",
      flowVersionId: "version-1", currentStepKey: "menu",
      expiresAt: new Date(Date.now() + 60_000), flowVersion: { steps }, answers: [],
    });

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText({
      ...input, provider, text: "我想體驗蒸足",
    });

    expect(result).toMatchObject({
      handled: true,
      outcome: "DIRECT_BOOKING",
      messages: [{ type: "text", urlButton: { label: "立即預約體驗" } }],
    });
    const message = result.messages[0];
    expect(message?.type).toBe("text");
    if (message?.type !== "text") throw new Error("Expected a text booking entry message");
    expect(message.urlButton?.url).toContain("/pricing/experience/zhubei/book");
    expect(message.text).not.toContain("請告訴我們您的需求");
    expect(repository.cancelConversation).toHaveBeenCalledWith(input.storeId, "conversation-menu");
    expect(repository.saveAnswer).not.toHaveBeenCalled();
    expect(repository.advanceConversation).not.toHaveBeenCalled();
  });

  it.each(["LINE", "MESSENGER"] as const)("sends the direct booking entry after an expired %s conversation without starting name collection", async (provider) => {
    repository.findActiveConversation.mockResolvedValue({
      id: "expired-conversation", storeId: input.storeId, flowId: "flow-1",
      flowVersionId: "version-1", currentStepKey: "menu",
      expiresAt: new Date(Date.now() - 16 * 60 * 1000), flowVersion: { steps: [] }, answers: [],
    });

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText({
      ...input, provider, text: "我想體驗蒸足",
    });

    expect(result).toMatchObject({
      handled: true,
      outcome: "DIRECT_BOOKING",
      messages: [{ type: "text", urlButton: { label: "立即預約體驗" } }],
    });
    expect(repository.expireConversation).toHaveBeenCalledWith(input.storeId, "expired-conversation");
    expect(repository.findTriggeredFlow).not.toHaveBeenCalled();
    expect(repository.createConversation).not.toHaveBeenCalled();
    expect(repository.saveAnswer).not.toHaveBeenCalled();
  });

  it("persists a top-level booking choice before starting the contact name step", async () => {
    const steps = [
      { id: "menu", stepKey: "menu", position: 0, type: "SINGLE_CHOICE" as const, required: true, config: {
        text: "請選擇", options: [{ label: "我想預約體驗", value: "BOOKING", nextStepKey: "name" }, { label: "其他", value: "INFO", nextStepKey: "name" }],
      } },
      questionStep("name", "name", 1),
    ];
    repository.findTriggeredFlow.mockResolvedValue({
      id: "flow-1", currentPublishedVersionId: "version-1",
      publishedVersion: { definition: { trigger: { keywords: [] } }, steps },
      startStepKey: "name",
      initialAnswer: { step: steps[0], value: { label: "我想預約體驗", value: "BOOKING", nextStepKey: "name" } },
    });
    repository.createConversation.mockResolvedValue({
      id: "conversation-1", storeId: input.storeId, flowId: "flow-1", flowVersionId: "version-1",
      currentStepKey: "name", expiresAt: new Date(Date.now() + 60_000), flowVersion: { steps },
      answers: [{ step: { stepKey: "menu" }, value: { label: "我想預約體驗", value: "BOOKING" } }],
    });

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText({ ...input, text: "我想預約體驗" });

    expect(result.messages).toEqual([{ type: "text", text: "請告訴我們您的需求" }]);
    expect(repository.createConversation).toHaveBeenCalledWith(expect.objectContaining({ currentStepKey: "name" }));
    expect(repository.saveAnswer).toHaveBeenCalledWith(expect.objectContaining({
      step: expect.objectContaining({ stepKey: "menu" }), value: expect.objectContaining({ value: "BOOKING" }),
    }));
  });

  it("starts a fresh menu after cancellation when the user sends the trigger again", async () => {
    const previousSteps = [questionStep("old-step", "phone", 0)];
    const newSteps = [
      textStep("new-opening", "opening", 0, "歡迎回來"),
      {
        id: "new-menu", stepKey: "menu", position: 1, type: "SINGLE_CHOICE" as const,
        config: { text: "請選擇：", options: [{ label: "我想預約體驗", value: "booking" }] },
        required: true,
      },
    ];
    repository.findActiveConversation
      .mockResolvedValueOnce({
        id: "cancelled-conversation", storeId: input.storeId, flowId: "old-flow",
        flowVersionId: "old-version", currentStepKey: "phone",
        expiresAt: new Date(Date.now() + 60_000), flowVersion: { steps: previousSteps }, answers: [],
      })
      .mockResolvedValueOnce(null);
    repository.findTriggeredFlow.mockResolvedValueOnce({
      id: "new-flow",
      currentPublishedVersionId: "new-version",
      publishedVersion: { definition: { trigger: { keywords: ["我想了解蒸足"] } }, steps: newSteps },
      startStepKey: null,
    });
    repository.createConversation.mockResolvedValueOnce({
      id: "new-conversation", storeId: input.storeId, flowId: "new-flow",
      flowVersionId: "new-version", currentStepKey: "opening",
      expiresAt: new Date(Date.now() + 60_000), flowVersion: { steps: newSteps }, answers: [],
    });

    const cancelled = await new DigitalButlerRuntime(repository as never, gate).handleText({
      ...input, text: "取消",
    });
    const restarted = await new DigitalButlerRuntime(repository as never, gate).handleText({
      ...input, text: "我想了解蒸足", webhookEventId: "event-after-cancel", messageId: "message-after-cancel",
    });

    expect(cancelled.outcome).toBe("CANCELLED_BY_USER");
    expect(restarted).toMatchObject({
      handled: true,
      outcome: "WAITING_INPUT",
      messages: [
        { type: "text", text: "歡迎回來" },
        { type: "text", text: "請選擇：" },
      ],
    });
    expect(repository.createConversation).toHaveBeenCalledWith(expect.objectContaining({
      flowId: "new-flow", flowVersionId: "new-version",
    }));
  });

  it("resumes from a top-level menu choice after handoff ended the previous conversation", async () => {
    const steps = [
      textStep("opening", "opening", 0, "歡迎"),
      {
        id: "menu", stepKey: "menu", position: 1, type: "SINGLE_CHOICE" as const,
        config: {
          text: "請選擇：",
          options: [{ label: "我想預約體驗", value: "booking", nextStepKey: "name" }],
        },
        required: true,
      },
      {
        id: "name", stepKey: "name", position: 2, type: "FREE_TEXT" as const,
        config: { prompt: "請問怎麼稱呼您？" }, required: true,
      },
    ];
    repository.findTriggeredFlow.mockResolvedValueOnce({
      id: "flow-1",
      currentPublishedVersionId: "version-1",
      publishedVersion: { definition: { trigger: { keywords: ["我想了解蒸足"] } }, steps },
      startStepKey: "name",
    });
    repository.createConversation.mockResolvedValueOnce({
      id: "new-conversation", storeId: input.storeId, flowId: "flow-1",
      flowVersionId: "version-1", currentStepKey: "name",
      expiresAt: new Date(Date.now() + 60_000), flowVersion: { steps }, answers: [],
    });

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText({
      ...input,
      provider: "MESSENGER",
      text: "我想預約體驗",
      webhookEventId: "event-after-handoff",
      messageId: "message-after-handoff",
    });

    expect(result).toMatchObject({
      handled: true,
      outcome: "WAITING_INPUT",
      messages: [{ type: "text", text: "請問怎麼稱呼您？" }],
    });
    expect(repository.createConversation).toHaveBeenCalledWith(expect.objectContaining({
      provider: "MESSENGER",
      currentStepKey: "name",
    }));
    expect(repository.advanceConversation).toHaveBeenCalledWith(expect.objectContaining({
      currentStepKey: "name",
      status: "WAITING_INPUT",
    }));
  });

  it("deduplicates a LINE redelivery before reading or advancing a conversation", async () => {
    repository.claimEvent.mockResolvedValue(false);
    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(input);
    expect(result).toEqual({ handled: true, messages: [], outcome: "DUPLICATE" });
    expect(gate).not.toHaveBeenCalled();
    expect(repository.findActiveConversation).not.toHaveBeenCalled();
  });

  it("scopes the same sender to its provider and channel account", async () => {
    repository.findTriggeredFlow.mockResolvedValue(null);

    await new DigitalButlerRuntime(repository as never, gate).handleText({
      ...input,
      provider: "MESSENGER",
      channelAccountId: "page-hsinchu",
      webhookEventId: "meta-event-1",
    });

    expect(repository.findActiveConversation).toHaveBeenCalledWith(
      input.storeId,
      "MESSENGER",
      "page-hsinchu",
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(repository.claimEvent).toHaveBeenCalledWith(expect.objectContaining({
      provider: "MESSENGER",
      eventKey: "messenger:meta-event-1",
    }));
  });

  it("drops a pending question reply when cancellation has already made the conversation inactive", async () => {
    repository.deliverReplyIfActive.mockResolvedValueOnce(false);
    const deliver = vi.fn(async () => undefined);

    const sent = await new DigitalButlerRuntime(repository as never, gate).deliverReplyIfActive(
      input.storeId,
      "conversation-1",
      deliver,
    );

    expect(sent).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("safely ends a conversation whose saved step no longer exists and asks the customer to restart", async () => {
    repository.findActiveConversation.mockResolvedValue({
      id: "conversation-1", storeId: input.storeId, flowId: "flow-1",
      flowVersionId: "version-1", currentStepKey: "removed-step",
      expiresAt: new Date(Date.now() + 60_000), flowVersion: { steps: [] }, answers: [],
    });

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(input);

    expect(repository.cancelConversation).toHaveBeenCalledWith(input.storeId, "conversation-1");
    expect(result).toMatchObject({
      outcome: "RESTART_REQUIRED",
      messages: [{ type: "text", text: expect.stringContaining("重新輸入") }],
    });
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

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText({ ...input, text: "增加新客" });
    expect(repository.saveAnswer).toHaveBeenCalledWith(expect.objectContaining({
      storeId: input.storeId, conversationId: "conversation-1", value: "增加新客",
    }));
    expect(repository.createLead).toHaveBeenCalledTimes(1);
    expect(repository.createLead).toHaveBeenCalledWith(expect.objectContaining({
      completionActionKey: "create-lead", submittedAnswers: { need: "增加新客" },
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

  it("does not create a lead or complete a flow when cancellation wins after an answer is saved", async () => {
    const steps = [
      questionStep("step-1", "need", 0),
      { id: "step-2", stepKey: "create-lead", position: 1, type: "CREATE_LEAD" as const, config: {}, required: false },
      { id: "step-3", stepKey: "complete", position: 2, type: "COMPLETE_FLOW" as const, config: {}, required: false },
    ];
    repository.findActiveConversation.mockResolvedValue({
      id: "conversation-1", storeId: input.storeId, flowId: "flow-1",
      flowVersionId: "version-1", currentStepKey: "need",
      expiresAt: new Date(Date.now() + 60_000),
      flowVersion: { steps }, answers: [],
    });
    repository.createLead.mockResolvedValueOnce(false);

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText({ ...input, text: "增加新客" });

    expect(repository.saveAnswer).toHaveBeenCalledTimes(1);
    expect(repository.createLead).toHaveBeenCalledTimes(1);
    expect(repository.advanceConversation).not.toHaveBeenCalled();
    expect(result).toEqual({ handled: true, messages: [], outcome: "INACTIVE_CONVERSATION" });
  });

  it("completes a lead when the final answer key is contact-time", async () => {
    const steps = [
      questionStep("step-1", "contact-time", 0),
      { id: "step-2", stepKey: "create-lead", position: 1, type: "CREATE_LEAD" as const, config: {}, required: false },
      textStep("step-3", "completion-message", 2, "資料已收到，我們會盡快與您聯絡"),
      { id: "step-4", stepKey: "complete", position: 3, type: "COMPLETE_FLOW" as const, config: {}, required: false },
    ];
    repository.findActiveConversation.mockResolvedValue({
      id: "conversation-1", storeId: input.storeId, flowId: "flow-1",
      flowVersionId: "version-1", currentStepKey: "contact-time",
      expiresAt: new Date(Date.now() + 60_000),
      flowVersion: { steps }, answers: [],
    });

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText({ ...input, text: "下午" });
    expect(repository.createLead).toHaveBeenCalledWith(expect.objectContaining({
      submittedAnswers: { "contact-time": "下午" },
    }));
    expect(repository.advanceConversation).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "COMPLETED", currentStepKey: null,
    }));
    expect(result).toEqual({
      handled: true,
      messages: [{ type: "text", text: "資料已收到，我們會盡快與您聯絡" }],
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

  it("branches from a selected answer and returns to the main menu", async () => {
    const steps = [
      {
        id: "step-1", stepKey: "menu", position: 0, type: "SINGLE_CHOICE" as const,
        config: {
          text: "想了解哪一方面？",
          options: [
            { label: "蒸足如何進行", value: "process", nextStepKey: "process" },
            { label: "我想預約體驗", value: "booking", nextStepKey: "name" },
          ],
        },
        required: true,
      },
      {
        id: "step-2", stepKey: "process", position: 1, type: "TEXT" as const,
        config: { text: "蒸足是一種舒適的日常保養方式", nextStepKey: "menu" },
        required: false,
      },
      questionStep("step-3", "name", 2),
      { id: "step-4", stepKey: "complete", position: 3, type: "COMPLETE_FLOW" as const, config: {}, required: false },
    ];
    repository.findActiveConversation.mockResolvedValue({
      id: "conversation-1", storeId: input.storeId, flowId: "flow-1",
      flowVersionId: "version-1", currentStepKey: "menu",
      expiresAt: new Date(Date.now() + 60_000),
      flowVersion: { steps }, answers: [],
    });

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText({
      ...input, text: "蒸足如何進行",
    });

    expect(result).toEqual({
      handled: true,
      messages: [
        { type: "text", text: "蒸足是一種舒適的日常保養方式" },
        {
          type: "text",
          text: "想了解哪一方面？",
          choices: [
            { label: "蒸足如何進行", value: "process" },
            { label: "我想預約體驗", value: "booking" },
          ],
        },
      ],
      outcome: "WAITING_INPUT",
      replyGuard: { conversationId: "conversation-1", requiresActiveConversation: true },
    });
    expect(repository.advanceConversation).toHaveBeenLastCalledWith(expect.objectContaining({
      currentStepKey: "menu", status: "WAITING_INPUT",
    }));
  });

  it("answers a price question during phone collection without validating or advancing the phone step", async () => {
    const steps = [
      mobileStep("step-phone", "phone", 0),
      textStep("step-price", "price", 1, "首次體驗 NT$499（原價 NT$799）。"),
    ];
    repository.findActiveConversation.mockResolvedValue({
      id: "conversation-1", storeId: input.storeId, flowId: "flow-1",
      flowVersionId: "version-1", currentStepKey: "phone",
      expiresAt: new Date(Date.now() + 60_000), flowVersion: { steps }, answers: [],
    });

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText({
      ...input, text: "首次體驗多少錢",
    });

    expect(result).toEqual({
      handled: true,
      messages: [
        { type: "text", text: "首次體驗 NT$499（原價 NT$799）。" },
        { type: "text", text: "請輸入 09 開頭的手機號碼" },
      ],
      outcome: "INFORMATION_ANSWERED",
      replyGuard: { conversationId: "conversation-1", requiresActiveConversation: true },
    });
    expect(repository.saveAnswer).not.toHaveBeenCalled();
    expect(repository.advanceConversation).not.toHaveBeenCalled();
    expect(repository.createLead).not.toHaveBeenCalled();

    await new DigitalButlerRuntime(repository as never, gate).handleText({
      ...input, webhookEventId: "event-2", text: "0912345678",
    });
    expect(repository.saveAnswer).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: "conversation-1", phone: "0912345678",
    }));
  });

  it("answers an address question during name collection without creating a new conversation or lead", async () => {
    const steps = [
      questionStep("step-name", "name", 0),
      textStep("step-address", "address", 1, "地址：新竹縣竹北市科大一路 80 號。"),
    ];
    repository.findActiveConversation.mockResolvedValue({
      id: "conversation-1", storeId: input.storeId, flowId: "flow-1",
      flowVersionId: "version-1", currentStepKey: "name",
      expiresAt: new Date(Date.now() + 60_000), flowVersion: { steps }, answers: [],
    });

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText({
      ...input, text: "地址在哪裡",
    });

    expect(result).toMatchObject({
      outcome: "INFORMATION_ANSWERED",
      messages: [
        { type: "text", text: "地址：新竹縣竹北市科大一路 80 號。" },
        { type: "text", text: "請告訴我們您的需求" },
      ],
    });
    expect(repository.createConversation).not.toHaveBeenCalled();
    expect(repository.saveAnswer).not.toHaveBeenCalled();
    expect(repository.createLead).not.toHaveBeenCalled();
  });

  it("keeps phone validation for non-information text", async () => {
    const steps = [mobileStep("step-phone", "phone", 0)];
    repository.findActiveConversation.mockResolvedValue({
      id: "conversation-1", storeId: input.storeId, flowId: "flow-1",
      flowVersionId: "version-1", currentStepKey: "phone",
      expiresAt: new Date(Date.now() + 60_000), flowVersion: { steps }, answers: [],
    });

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText({
      ...input, text: "0912",
    });

    expect(result).toMatchObject({ outcome: "VALIDATION_FAILED" });
    expect(result.messages).toEqual([{
      type: "text",
      text: "手機格式不正確，請輸入 09 開頭的 10 碼手機號碼。",
    }]);
    expect(repository.saveAnswer).not.toHaveBeenCalled();
  });

  it("keeps HANDOFF ahead of information matching and free-text validation", async () => {
    const steps = [questionStep("step-name", "name", 0)];
    repository.findActiveConversation.mockResolvedValue({
      id: "conversation-1", storeId: input.storeId, flowId: "flow-1",
      flowVersionId: "version-1", currentStepKey: "name",
      expiresAt: new Date(Date.now() + 60_000), flowVersion: { steps }, answers: [],
    });

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText({
      ...input, text: "轉接客服",
    });

    expect(result).toMatchObject({ outcome: "HANDOFF_REQUESTED" });
    expect(repository.cancelConversation).toHaveBeenCalledWith(input.storeId, "conversation-1");
    expect(repository.saveAnswer).not.toHaveBeenCalled();
  });
});
