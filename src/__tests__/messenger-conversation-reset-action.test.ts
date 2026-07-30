import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  resolveWriteStoreId: vi.fn(),
  findStore: vi.fn(),
  findConversation: vi.fn(),
  findAnswer: vi.fn(),
  updateConversation: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("zod", () => ({
  z: { string: () => ({ trim: () => ({ min: () => ({ max: () => ({ parse: (value: unknown) => {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 128) throw new Error("invalid conversation ID");
    return value.trim();
  } }) }) }) }) },
}));
vi.mock("@/lib/permissions", () => ({ requirePermission: h.requirePermission }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: h.resolveWriteStoreId }));
vi.mock("@/lib/db", () => ({
  prisma: {
    store: { findUnique: h.findStore },
    digitalButlerConversation: { findFirst: h.findConversation },
    digitalButlerAnswer: { findFirst: h.findAnswer },
    auditLog: { create: h.auditCreate },
    $transaction: h.transaction,
  },
}));

import {
  diagnoseMessengerConversationAction,
  endMessengerConversationAction,
} from "@/app/(dashboard)/dashboard/settings/messenger-audit/conversation-actions";

const activeConversation = () => ({
  id: "conversation-test-1", status: "WAITING_INPUT", currentStepKey: "phone",
  expiresAt: new Date("2026-07-30T00:00:00.000Z"), cancelledAt: null, completedAt: null,
  createdAt: new Date("2026-07-29T00:00:00.000Z"), updatedAt: new Date("2026-07-29T01:00:00.000Z"),
  _count: { answers: 2, leads: 1, executionLogs: 3 },
  flow: { currentPublishedVersionId: "version-active", publishedVersion: { version: 7 } },
  flowVersion: {
    id: "version-conversation",
    version: 4,
    steps: [
      { id: "step-menu", stepKey: "menu", type: "SINGLE_CHOICE", config: { options: [] } },
      { id: "step-create", stepKey: "create-lead", type: "CREATE_LEAD", config: { requestTypeFromStepKey: "menu" } },
    ],
  },
});

describe("Messenger conversation reset actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requirePermission.mockResolvedValue({ id: "owner-1", role: "OWNER", storeId: "store-zhubei" });
    h.resolveWriteStoreId.mockResolvedValue("store-zhubei");
    h.findStore.mockResolvedValue({ id: "store-zhubei", slug: "zhubei" });
    h.auditCreate.mockResolvedValue({ id: "audit-1" });
    h.findAnswer.mockResolvedValue({ value: { value: "BOOKING", label: "預約體驗" } });
    h.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      digitalButlerConversation: { findFirst: h.findConversation, update: h.updateConversation },
      auditLog: { create: h.auditCreate },
    }));
  });

  it("diagnoses the conversation-bound flow version, not the active version, without updating it", async () => {
    h.findConversation.mockResolvedValue(activeConversation());

    await expect(diagnoseMessengerConversationAction("conversation-test-1")).resolves.toMatchObject({
      success: true,
      conversation: {
        id: "conversation-test-1", status: "WAITING_INPUT", answerCount: 2,
        completionDiagnostic: {
          conversationFlowVersion: 4,
          activeFlowVersion: 7,
          usesActiveFlowVersion: false,
          createLeadStepKey: "create-lead",
          requestTypeFromStepKey: "menu",
          selectorCategory: "BOOKING",
          predictedCompletionType: "URL_BUTTON",
          completionReason: "BOOKING_SELECTOR_MATCHED",
        },
      },
    });
    expect(h.findConversation).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "conversation-test-1", storeId: "store-zhubei", provider: "MESSENGER" },
    }));
    expect(h.updateConversation).not.toHaveBeenCalled();
    expect(h.findAnswer).toHaveBeenCalledWith({
      where: { storeId: "store-zhubei", conversationId: "conversation-test-1", stepId: "step-menu" },
      select: { value: true },
    });
    expect(h.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      action: "MESSENGER_CONVERSATION_READONLY_DIAGNOSED",
      afterJson: { found: true, provider: "MESSENGER", status: "WAITING_INPUT" },
    }) }));
  });

  it("rejects non-admin users and out-of-scope or LINE conversations before exposing diagnostics", async () => {
    h.requirePermission.mockResolvedValue({ id: "staff-1", role: "STAFF" });
    await expect(diagnoseMessengerConversationAction("conversation-test-1")).resolves.toMatchObject({ success: false });
    expect(h.findConversation).not.toHaveBeenCalled();

    h.requirePermission.mockResolvedValue({ id: "owner-1", role: "OWNER" });
    h.findStore.mockResolvedValue({ id: "store-other", slug: "other" });
    await expect(diagnoseMessengerConversationAction("conversation-test-1")).resolves.toMatchObject({ success: false });
    expect(h.findConversation).not.toHaveBeenCalled();

    h.findStore.mockResolvedValue({ id: "store-zhubei", slug: "zhubei" });
    h.findConversation.mockResolvedValue(null);
    await expect(diagnoseMessengerConversationAction("line-conversation")).resolves.toEqual({
      success: false, error: "找不到竹北店的 Messenger conversation",
    });
    expect(h.findConversation).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: "line-conversation", storeId: "store-zhubei", provider: "MESSENGER" },
    }));
  });

  it("does not select or return submitted answers, identity, phone, or message content", async () => {
    h.findConversation.mockResolvedValue(activeConversation());
    const result = await diagnoseMessengerConversationAction("conversation-test-1");
    const select = h.findConversation.mock.calls[0][0].select;

    expect(select).not.toHaveProperty("answers");
    expect(select).not.toHaveProperty("senderIdCiphertext");
    expect(select).not.toHaveProperty("channelAccountId");
    expect(h.findAnswer).toHaveBeenCalledWith(expect.objectContaining({ select: { value: true } }));
    expect(JSON.stringify(result)).not.toContain("預約體驗");
    expect(JSON.stringify(result)).not.toContain("submittedAnswers");
  });

  it("refuses an end operation outside zhubei before looking up a conversation", async () => {
    h.findStore.mockResolvedValue({ id: "store-other", slug: "other" });

    await expect(endMessengerConversationAction({ conversationId: "conversation-test-1", confirmationConversationId: "conversation-test-1" })).resolves.toEqual({
      success: false, error: "MESSENGER_CONVERSATION_RESET_ZHUBEI_ONLY",
    });
    expect(h.findConversation).not.toHaveBeenCalled();
    expect(h.updateConversation).not.toHaveBeenCalled();
  });

  it("requires an exact confirmation and does not start a transaction when it differs", async () => {
    await expect(endMessengerConversationAction({ conversationId: "conversation-test-1", confirmationConversationId: "different" })).resolves.toEqual({
      success: false, error: "確認用 conversation ID 不相符",
    });
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it("ends only active scoped Messenger conversations and writes the before/after audit in the transaction", async () => {
    const before = activeConversation();
    h.findConversation.mockResolvedValue(before);
    h.updateConversation.mockResolvedValue({ ...before, status: "CANCELLED", currentStepKey: null, cancelledAt: new Date("2026-07-29T02:00:00.000Z") });

    await expect(endMessengerConversationAction({ conversationId: "conversation-test-1", confirmationConversationId: "conversation-test-1" })).resolves.toMatchObject({
      success: true, conversation: { status: "CANCELLED", currentStepKey: null },
    });
    expect(h.updateConversation).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "conversation-test-1" },
      data: expect.objectContaining({ status: "CANCELLED", currentStepKey: null }),
    }));
    expect(h.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      action: "MESSENGER_CONVERSATION_ENDED_BY_ADMIN",
      beforeJson: { status: "WAITING_INPUT", currentStepKey: "phone" },
      afterJson: { status: "CANCELLED", currentStepKey: null, provider: "MESSENGER" },
    }) }));
    expect(h.revalidatePath).toHaveBeenCalledWith("/dashboard/settings/messenger-audit");
  });

  it("does not change an inactive conversation and audits the denied reset", async () => {
    h.findConversation.mockResolvedValue({ ...activeConversation(), status: "COMPLETED" });

    await expect(endMessengerConversationAction({ conversationId: "conversation-test-1", confirmationConversationId: "conversation-test-1" })).resolves.toEqual({
      success: false, error: "此 conversation 不是進行中狀態，未做任何變更",
    });
    expect(h.updateConversation).not.toHaveBeenCalled();
    expect(h.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "MESSENGER_CONVERSATION_END_DENIED" }) }));
  });
});
