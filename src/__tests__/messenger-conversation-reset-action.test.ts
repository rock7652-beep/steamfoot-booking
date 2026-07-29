import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  resolveWriteStoreId: vi.fn(),
  findStore: vi.fn(),
  findConversation: vi.fn(),
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
});

describe("Messenger conversation reset actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requirePermission.mockResolvedValue({ id: "owner-1", role: "OWNER", storeId: "store-zhubei" });
    h.resolveWriteStoreId.mockResolvedValue("store-zhubei");
    h.findStore.mockResolvedValue({ id: "store-zhubei", slug: "zhubei" });
    h.auditCreate.mockResolvedValue({ id: "audit-1" });
    h.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      digitalButlerConversation: { findFirst: h.findConversation, update: h.updateConversation },
      auditLog: { create: h.auditCreate },
    }));
  });

  it("diagnoses exactly one scoped Messenger conversation without updating it and audits safe metadata", async () => {
    h.findConversation.mockResolvedValue(activeConversation());

    await expect(diagnoseMessengerConversationAction("conversation-test-1")).resolves.toMatchObject({
      success: true,
      conversation: { id: "conversation-test-1", status: "WAITING_INPUT", answerCount: 2 },
    });
    expect(h.findConversation).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "conversation-test-1", storeId: "store-zhubei", provider: "MESSENGER" },
    }));
    expect(h.updateConversation).not.toHaveBeenCalled();
    expect(h.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      action: "MESSENGER_CONVERSATION_READONLY_DIAGNOSED",
      afterJson: { found: true, provider: "MESSENGER", status: "WAITING_INPUT" },
    }) }));
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
