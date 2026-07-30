"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  diagnoseMessengerCompletion,
  type MessengerCompletionReason,
  type MessengerPredictedCompletionType,
  type MessengerSelectorCategory,
} from "@/lib/messenger-completion-diagnostic";
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
  completionDiagnostic?: {
    conversationFlowVersion: number;
    activeFlowVersion: number | null;
    usesActiveFlowVersion: boolean;
    createLeadStepKey: string | null;
    requestTypeFromStepKey: string | null;
    selectorCategory: MessengerSelectorCategory;
    predictedCompletionType: MessengerPredictedCompletionType;
    completionReason: MessengerCompletionReason;
  };
};

type ActionResult =
  | { success: true; conversation: ConversationSummary }
  | { success: false; error: string };

export type RecentMessengerConversation = {
  id: string;
  status: string;
  currentStepKey: string | null;
  updatedAt: string;
  flowVersion: number;
  usesCurrentActiveVersion: boolean;
};

export type RecentMessengerConversationsResult =
  | { success: true; conversations: RecentMessengerConversation[] }
  | { success: false; error: string };

function summary(conversation: {
  id: string; status: string; currentStepKey: string | null; expiresAt: Date;
  cancelledAt: Date | null; completedAt: Date | null; createdAt: Date; updatedAt: Date;
  _count: { answers: number; leads: number; executionLogs: number };
}, completionDiagnostic?: NonNullable<ConversationSummary["completionDiagnostic"]>): ConversationSummary {
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
    ...(completionDiagnostic ? { completionDiagnostic } : {}),
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

/** Lists only safe operational metadata. Sender identity, answers and message content are never selected. */
export async function listRecentMessengerConversationsAction(): Promise<RecentMessengerConversationsResult> {
  try {
    const { storeId } = await secureZhubeiMessengerContext();
    const [flows, conversations] = await Promise.all([
      prisma.storeDigitalButlerFlow.findMany({
        where: { storeId },
        select: { id: true, currentPublishedVersionId: true },
      }),
      prisma.digitalButlerConversation.findMany({
        where: { storeId, provider: "MESSENGER" },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          currentStepKey: true,
          updatedAt: true,
          flowId: true,
          flowVersionId: true,
          flowVersion: { select: { version: true } },
        },
      }),
    ]);
    const activeVersionByFlowId = new Map(flows.map((flow) => [flow.id, flow.currentPublishedVersionId]));
    return {
      success: true,
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        status: conversation.status,
        currentStepKey: conversation.currentStepKey,
        updatedAt: conversation.updatedAt.toISOString(),
        flowVersion: conversation.flowVersion.version,
        usesCurrentActiveVersion: activeVersionByFlowId.get(conversation.flowId) === conversation.flowVersionId,
      })),
    };
  } catch {
    return { success: false, error: "暫時無法載入 Messenger 對話，請稍後再試。" };
  }
}

export async function diagnoseMessengerConversationAction(conversationIdInput: string): Promise<ActionResult> {
  try {
    const conversationId = conversationIdSchema.parse(conversationIdInput);
    const { actorUserId, storeId } = await secureZhubeiMessengerContext();
    const conversation = await prisma.digitalButlerConversation.findFirst({
      where: { id: conversationId, storeId, provider: "MESSENGER" },
      select: {
        ...conversationSelect,
        flow: { select: { currentPublishedVersionId: true, publishedVersion: { select: { version: true } } } },
        flowVersion: {
          select: {
            id: true,
            version: true,
            steps: { select: { id: true, stepKey: true, type: true, config: true } },
          },
        },
      },
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
    const createLeadStep = conversation.flowVersion.steps.find((step) => step.type === "CREATE_LEAD") ?? null;
    const configuredSelector = createLeadStep && isRecord(createLeadStep.config) && typeof createLeadStep.config.requestTypeFromStepKey === "string"
      ? createLeadStep.config.requestTypeFromStepKey
      : null;
    const selectorStep = configuredSelector
      ? conversation.flowVersion.steps.find((step) => step.stepKey === configuredSelector) ?? null
      : null;
    // Read one value only when the configured step is a choice. This avoids
    // loading free-text answers such as customer name or phone number.
    const selectorAnswer = selectorStep?.type === "SINGLE_CHOICE"
      ? await prisma.digitalButlerAnswer.findFirst({
          where: { storeId, conversationId: conversation.id, stepId: selectorStep.id },
          select: { value: true },
        })
      : null;
    const predicted = diagnoseMessengerCompletion({
      createLeadStepFound: Boolean(createLeadStep),
      selectorConfigured: Boolean(configuredSelector),
      selectorIsSafeChoice: selectorStep?.type === "SINGLE_CHOICE",
      selectorValue: selectorAnswer?.value,
    });
    return {
      success: true,
      conversation: summary(conversation, {
        conversationFlowVersion: conversation.flowVersion.version,
        activeFlowVersion: conversation.flow.publishedVersion?.version ?? null,
        usesActiveFlowVersion: conversation.flow.currentPublishedVersionId === conversation.flowVersion.id,
        createLeadStepKey: createLeadStep?.stepKey ?? null,
        requestTypeFromStepKey: configuredSelector,
        ...predicted,
      }),
    };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
