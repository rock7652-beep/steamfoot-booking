"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";

const conversationIdSchema = z.string().trim().min(1).max(128);
const activeStatuses = ["IN_PROGRESS", "WAITING_INPUT"] as const;

type ConversationSummary = {
  id: string;
  status: string;
  currentStepKey: string | null;
  expiresAt: string;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  answerCount: number;
  leadCount: number;
  executionLogCount: number;
};

type ActionResult =
  | { success: true; conversation: ConversationSummary }
  | { success: false; error: string };

function summary(conversation: {
  id: string; status: string; currentStepKey: string | null; expiresAt: Date;
  cancelledAt: Date | null; completedAt: Date | null; createdAt: Date; updatedAt: Date;
  _count: { answers: number; leads: number; executionLogs: number };
}): ConversationSummary {
  return {
    id: conversation.id,
    status: conversation.status,
    currentStepKey: conversation.currentStepKey,
    expiresAt: conversation.expiresAt.toISOString(),
    cancelledAt: conversation.cancelledAt?.toISOString() ?? null,
    completedAt: conversation.completedAt?.toISOString() ?? null,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    answerCount: conversation._count.answers,
    leadCount: conversation._count.leads,
    executionLogCount: conversation._count.executionLogs,
  };
}

async function secureZhubeiMessengerContext() {
  const user = await requirePermission("plans.edit");
  if (user.role !== "OWNER" && user.role !== "ADMIN") throw new Error("MESSENGER_CONVERSATION_RESET_FORBIDDEN");
  const storeId = await resolveWriteStoreId(user);
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, slug: true } });
  if (!store || store.slug !== "zhubei") throw new Error("MESSENGER_CONVERSATION_RESET_ZHUBEI_ONLY");
  return { actorUserId: user.id, storeId: store.id };
}

const conversationSelect = {
  id: true, status: true, currentStepKey: true, expiresAt: true, cancelledAt: true,
  completedAt: true, createdAt: true, updatedAt: true,
  _count: { select: { answers: true, leads: true, executionLogs: true } },
} as const;

export async function diagnoseMessengerConversationAction(conversationIdInput: string): Promise<ActionResult> {
  try {
    const conversationId = conversationIdSchema.parse(conversationIdInput);
    const { actorUserId, storeId } = await secureZhubeiMessengerContext();
    const conversation = await prisma.digitalButlerConversation.findFirst({
      where: { id: conversationId, storeId, provider: "MESSENGER" },
      select: conversationSelect,
    });
    await prisma.auditLog.create({
      data: {
        actorUserId,
        targetType: "DigitalButlerConversation",
        targetId: conversationId,
        action: "MESSENGER_CONVERSATION_READONLY_DIAGNOSED",
        afterJson: { found: Boolean(conversation), provider: "MESSENGER", ...(conversation ? { status: conversation.status } : {}) },
      },
    });
    if (!conversation) return { success: false, error: "找不到竹北店的 Messenger conversation" };
    return { success: true, conversation: summary(conversation) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "診斷失敗" };
  }
}

export async function endMessengerConversationAction(input: { conversationId: string; confirmationConversationId: string }): Promise<ActionResult> {
  try {
    const conversationId = conversationIdSchema.parse(input.conversationId);
    if (input.confirmationConversationId.trim() !== conversationId) {
      return { success: false, error: "確認用 conversation ID 不相符" };
    }
    const { actorUserId, storeId } = await secureZhubeiMessengerContext();
    const result = await prisma.$transaction(async (tx) => {
      const conversation = await tx.digitalButlerConversation.findFirst({
        where: { id: conversationId, storeId, provider: "MESSENGER" },
        select: conversationSelect,
      });
      if (!conversation) {
        await tx.auditLog.create({ data: { actorUserId, targetType: "DigitalButlerConversation", targetId: conversationId, action: "MESSENGER_CONVERSATION_END_DENIED", afterJson: { reason: "NOT_FOUND_OR_OUT_OF_SCOPE", provider: "MESSENGER" } } });
        return null;
      }
      if (!activeStatuses.includes(conversation.status as typeof activeStatuses[number])) {
        await tx.auditLog.create({ data: { actorUserId, targetType: "DigitalButlerConversation", targetId: conversationId, action: "MESSENGER_CONVERSATION_END_DENIED", beforeJson: { status: conversation.status }, afterJson: { reason: "NOT_ACTIVE", provider: "MESSENGER" } } });
        return { conversation, ended: false };
      }
      const ended = await tx.digitalButlerConversation.update({
        where: { id: conversation.id },
        data: { status: "CANCELLED", currentStepKey: null, cancelledAt: new Date() },
        select: conversationSelect,
      });
      await tx.auditLog.create({ data: { actorUserId, targetType: "DigitalButlerConversation", targetId: conversation.id, action: "MESSENGER_CONVERSATION_ENDED_BY_ADMIN", beforeJson: { status: conversation.status, currentStepKey: conversation.currentStepKey }, afterJson: { status: ended.status, currentStepKey: ended.currentStepKey, provider: "MESSENGER" } } });
      return { conversation: ended, ended: true };
    });
    if (!result) return { success: false, error: "找不到竹北店的 Messenger conversation" };
    if (!result.ended) return { success: false, error: "此 conversation 不是進行中狀態，未做任何變更" };
    revalidatePath("/dashboard/settings/messenger-audit");
    return { success: true, conversation: summary(result.conversation) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "結束失敗" };
  }
}
