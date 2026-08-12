import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/digital-butler-entitlement", () => ({
  requireDigitalButlerConversationActivation: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { digitalButlerLead: { findUnique: vi.fn(async () => null) } },
}));

import { DigitalButlerRuntime } from "@/server/services/digital-butler-runtime";

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
  createLead: vi.fn(async (): Promise<{ leadId: string; created: boolean } | null> => ({ leadId: "lead-1", created: true })),
  deliverReplyIfActive: vi.fn(async () => true),
};
const gate = vi.fn(async () => undefined);

const steps = [
  { id: "request", stepKey: "menu", position: 0, type: "SINGLE_CHOICE" as const, required: true, config: { text: "需求", options: [{ label: "預約體驗", value: "BOOKING", nextStepKey: "name" }, { label: "請店家聯絡", value: "CONTACT", nextStepKey: "name" }] } },
  { id: "name", stepKey: "name", position: 1, type: "FREE_TEXT" as const, required: true, config: { text: "姓名", field: "name", nextStepKey: "phone" } },
  { id: "phone", stepKey: "phone", position: 2, type: "TAIWAN_MOBILE" as const, required: true, config: { text: "手機", nextStepKey: "confirm" } },
  { id: "confirm", stepKey: "confirm", position: 3, type: "SINGLE_CHOICE" as const, required: true, config: { text: "確認", contactConfirmation: true, requestStepKey: "menu", options: [{ label: "確認送出", value: "CONFIRM", nextStepKey: "create" }, { label: "重新填寫", value: "RESTART", nextStepKey: "name" }] } },
  { id: "create", stepKey: "create", position: 4, type: "CREATE_LEAD" as const, required: false, config: { requireCompleteContact: true, nameStepKey: "name", phoneStepKey: "phone", requestTypeFromStepKey: "menu", nextStepKey: "completion" } },
  { id: "completion", stepKey: "completion", position: 5, type: "TEXT" as const, required: false, config: { text: "已收到您的資料，店家將儘快與您聯絡。", nextStepKey: "complete" } },
  { id: "complete", stepKey: "complete", position: 6, type: "COMPLETE_FLOW" as const, required: false, config: {} },
];
const directCompletionSteps = steps
  .filter((step) => step.stepKey !== "completion")
  .map((step) => step.stepKey === "create"
    ? { ...step, config: { ...step.config, nextStepKey: "complete" } }
    : step) as typeof steps;

function conversation(
  currentStepKey: string,
  answers: Array<{ step: { stepKey: string }; value: unknown; phoneHash?: string | null }> = [],
  flowSteps = steps,
) {
  return { id: "conversation-1", storeId: "store-1", provider: "MESSENGER" as const, flowId: "flow-1", flowVersionId: "version-1", currentStepKey, expiresAt: new Date(Date.now() + 60_000), flowVersion: { steps: flowSteps }, answers };
}

function input(text: string, webhookEventId: string) {
  return { storeId: "store-1", provider: "MESSENGER" as const, channelAccountId: "page-1", senderId: "psid-1", text, webhookEventId, messageId: webhookEventId, occurredAt: new Date() };
}

describe("complete contact lead flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DIGITAL_BUTLER_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64url");
    repository.claimEvent.mockResolvedValue(true);
  });

  it("rejects a symbolic name and stays on the name step", async () => {
    repository.findActiveConversation.mockResolvedValue(conversation("name"));
    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(input("---", "m-name"));
    expect(result.outcome).toBe("VALIDATION_FAILED");
    expect(result.messages[0]).toMatchObject({ text: expect.stringContaining("不能只使用符號") });
    expect(repository.saveAnswer).not.toHaveBeenCalled();
    expect(repository.createLead).not.toHaveBeenCalled();
  });

  it("normalizes Messenger phone punctuation and creates only after confirmation", async () => {
    repository.findActiveConversation.mockResolvedValue(conversation("phone", [
      { step: { stepKey: "menu" }, value: { value: "BOOKING", label: "預約體驗" } },
      { step: { stepKey: "name" }, value: "王小美" },
    ]));
    const phoneResult = await new DigitalButlerRuntime(repository as never, gate).handleText(input("0912-345-678", "m-phone"));
    expect(repository.saveAnswer).toHaveBeenCalledWith(expect.objectContaining({ phone: "0912345678" }));
    expect(repository.createLead).not.toHaveBeenCalled();
    expect(phoneResult.messages[0]).toMatchObject({ text: expect.stringContaining("姓名：王小美") });
    expect(phoneResult.messages[0]).toMatchObject({ text: expect.stringContaining("手機：0912345678") });
    expect(phoneResult.messages[0]).toMatchObject({ text: expect.stringContaining("需求：預約體驗") });

    repository.findActiveConversation.mockResolvedValue(conversation("confirm", [
      { step: { stepKey: "menu" }, value: { value: "BOOKING", label: "預約體驗" } },
      { step: { stepKey: "name" }, value: "王小美" },
      { step: { stepKey: "phone" }, value: null, phoneHash: "hash" },
    ]));
    await new DigitalButlerRuntime(repository as never, gate).handleText(input("CONFIRM", "m-confirm"));
    expect(repository.createLead).toHaveBeenCalledWith(expect.objectContaining({
      submittedAnswers: { menu: { value: "BOOKING", label: "預約體驗" }, name: "王小美", confirm: { value: "CONFIRM", label: "確認送出" }, requestType: { value: "BOOKING", label: "預約體驗" } },
    }));
    expect(JSON.stringify(repository.createLead.mock.calls)).not.toContain("0912345678");
  });

  it("does not create a lead when the same Messenger webhook is redelivered", async () => {
    repository.claimEvent.mockResolvedValue(false);
    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(input("CONFIRM", "m-duplicate"));
    expect(result.outcome).toBe("DUPLICATE");
    expect(repository.createLead).not.toHaveBeenCalled();
  });

  it("adds the canonical booking link before a Messenger BOOKING flow completes without a TEXT step", async () => {
    repository.findActiveConversation.mockResolvedValue(conversation("confirm", [
      { step: { stepKey: "menu" }, value: { value: "BOOKING", label: "預約體驗" } },
      { step: { stepKey: "name" }, value: "王小美" },
      { step: { stepKey: "phone" }, value: null, phoneHash: "hash" },
    ], directCompletionSteps));

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(input("CONFIRM", "m-booking"));

    expect(result.messages).toEqual([expect.objectContaining({
      type: "text",
      text: expect.stringContaining("https://www.steamfoot.com/pricing/experience/zhubei/book#booking-form"),
      urlButton: {
        label: "立即預約體驗",
        url: "https://www.steamfoot.com/pricing/experience/zhubei/book#booking-form",
      },
    })]);
    expect(repository.createLead).toHaveBeenCalledWith(expect.objectContaining({
      submittedAnswers: expect.objectContaining({
        menu: { value: "BOOKING", label: "預約體驗" },
        requestType: { value: "BOOKING", label: "預約體驗" },
      }),
    }));
  });

  it("keeps CONTACT_STORE completion free of a booking link", async () => {
    repository.findActiveConversation.mockResolvedValue(conversation("confirm", [
      { step: { stepKey: "menu" }, value: { value: "CONTACT_STORE", label: "請店家聯絡" } },
      { step: { stepKey: "name" }, value: "王小美" },
      { step: { stepKey: "phone" }, value: null, phoneHash: "hash" },
    ]));

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(input("CONFIRM", "m-contact"));

    expect(result.messages).toEqual([{ type: "text", text: "已收到您的資料，店家將儘快與您聯絡。" }]);
  });

  it("does not show a booking link when lead creation fails", async () => {
    repository.createLead.mockResolvedValueOnce(null);
    repository.findActiveConversation.mockResolvedValue(conversation("confirm", [
      { step: { stepKey: "menu" }, value: { value: "BOOKING", label: "預約體驗" } },
      { step: { stepKey: "name" }, value: "王小美" },
      { step: { stepKey: "phone" }, value: null, phoneHash: "hash" },
    ]));

    const result = await new DigitalButlerRuntime(repository as never, gate).handleText(input("CONFIRM", "m-lead-failed"));

    expect(result.messages).toEqual([]);
    expect(result.outcome).toBe("INACTIVE_CONVERSATION");
  });
});
