import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { encryptDigitalButlerValue, hashDigitalButlerSensitiveValue } from "@/lib/digital-butler-crypto";
import { getUserProfile } from "@/lib/line";
import type { DigitalButlerInboundTextMessage } from "@/server/services/digital-butler-channel";
import { notifyStoreManagerOnLine } from "@/server/services/store-manager-line-notifications";

export const HUMAN_SUPPORT_COMPLETION_ACTION_KEY = "__human_support_handoff__";

type LineProfile = Awaited<ReturnType<typeof getUserProfile>>;

function safeHttpsAvatarUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "profile.line-scdn.net" ? url.toString() : null;
  } catch {
    return null;
  }
}

const OPTIONAL_LINE_PROFILE_TIMEOUT_MS = 1_000;

async function getOptionalLineProfile(input: DigitalButlerInboundTextMessage): Promise<LineProfile> {
  if (input.provider !== "LINE") return null;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutProfile = new Promise<null>((resolve) => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, OPTIONAL_LINE_PROFILE_TIMEOUT_MS);
    });
    const profile = await Promise.race([
      getUserProfile(input.storeId, input.senderId, { signal: controller.signal }),
      timeoutProfile,
    ]);
    if (!profile || profile.error || !profile.displayName.trim()) return null;
    return profile;
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function claimNotification(storeId: string, eventKey: string, eventType: string): Promise<string | null> {
  try {
    const claim = await prisma.digitalButlerExecutionLog.create({
      data: { storeId, eventKey, eventType, outcome: "CLAIMED" },
      select: { id: true },
    });
    return claim.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
}

async function releaseClaim(claimId: string): Promise<void> {
  await prisma.digitalButlerExecutionLog.delete({ where: { id: claimId } }).catch(() => undefined);
}

export async function recordHumanSupportHandoff(input: DigitalButlerInboundTextMessage): Promise<void> {
  try {
    const senderIdHash = hashDigitalButlerSensitiveValue(input.senderId);
    const conversation = await prisma.digitalButlerConversation.findFirst({
      where: {
        storeId: input.storeId,
        provider: input.provider,
        channelAccountId: input.channelAccountId,
        senderIdHash,
        status: "CANCELLED",
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, flowId: true },
    });
    if (!conversation) {
      console.warn("[HumanSupportHandoff] cancelled conversation not found", { storeId: input.storeId });
      return;
    }

    const profile = await getOptionalLineProfile(input);
    const lastMessage = input.text.trim().slice(0, 160);
    const encryptedMessage = lastMessage ? encryptDigitalButlerValue(lastMessage) : null;
    const messageSnapshot = encryptedMessage ? {
      lastMessageCiphertext: new Uint8Array(encryptedMessage.ciphertext),
      lastMessageIv: new Uint8Array(encryptedMessage.iv),
      lastMessageAuthTag: new Uint8Array(encryptedMessage.authTag),
      lastMessageAt: input.occurredAt,
    } : {};
    const profileSnapshot = profile ? {
      customerDisplayName: profile.displayName.trim() || null,
      customerAvatarUrl: safeHttpsAvatarUrl(profile.pictureUrl),
    } : {};
    const lead = await prisma.digitalButlerLead.upsert({
      where: {
        storeId_conversationId_completionActionKey: {
          storeId: input.storeId,
          conversationId: conversation.id,
          completionActionKey: HUMAN_SUPPORT_COMPLETION_ACTION_KEY,
        },
      },
      update: {
        ...profileSnapshot,
        ...messageSnapshot,
      },
      create: {
        storeId: input.storeId,
        flowId: conversation.flowId,
        conversationId: conversation.id,
        completionActionKey: HUMAN_SUPPORT_COMPLETION_ACTION_KEY,
        submittedAnswers: { requestType: "HUMAN_SUPPORT", provider: input.provider },
        customerDisplayName: profile?.displayName.trim() || null,
        customerAvatarUrl: safeHttpsAvatarUrl(profile?.pictureUrl),
        customerReference: `客服-${senderIdHash.slice(0, 8)}`,
        ...messageSnapshot,
      },
      select: { id: true },
    });

    const eventKey = `human-support-requested:${lead.id}`;
    const claimId = await claimNotification(input.storeId, eventKey, "HUMAN_SUPPORT_REQUESTED");
    if (!claimId) return;

    const store = await prisma.store.findUnique({
      where: { id: input.storeId },
      select: { slug: true },
    });
    if (!store) {
      await releaseClaim(claimId);
      return;
    }

    const delivery = await notifyStoreManagerOnLine({
      type: "HUMAN_SUPPORT_REQUESTED",
      eventKey,
      storeId: input.storeId,
      storeSlug: store.slug,
      leadId: lead.id,
      provider: input.provider,
    });

    if (delivery.status === "sent") {
      await prisma.digitalButlerExecutionLog.update({
        where: { id: claimId },
        data: { outcome: delivery.failedCount > 0 ? "PARTIAL" : "SENT" },
      });
    } else {
      await releaseClaim(claimId);
    }
  } catch (error) {
    console.error("[HumanSupportHandoff] failed", {
      storeId: input.storeId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export interface HumanSupportReminderResult {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function runHumanSupportFinalReminders(now = new Date()): Promise<HumanSupportReminderResult> {
  const threshold = new Date(now.getTime() - 30 * 60 * 1000);
  const candidates = await prisma.digitalButlerLead.findMany({
    where: {
      completionActionKey: HUMAN_SUPPORT_COMPLETION_ACTION_KEY,
      status: "NEW",
      assignedStaffId: null,
      createdAt: { lte: threshold },
    },
    select: { id: true, storeId: true, store: { select: { slug: true } } },
    take: 200,
    orderBy: { createdAt: "asc" },
  });

  const result: HumanSupportReminderResult = { scanned: candidates.length, sent: 0, skipped: 0, failed: 0 };

  for (const candidate of candidates) {
    const eventKey = `human-support-final-reminder:${candidate.id}`;
    let claimId: string | null = null;
    try {
      claimId = await claimNotification(candidate.storeId, eventKey, "HUMAN_SUPPORT_FINAL_REMINDER");
      if (!claimId) {
        result.skipped += 1;
        continue;
      }

      const stillWaiting = await prisma.digitalButlerLead.findFirst({
        where: {
          id: candidate.id,
          storeId: candidate.storeId,
          completionActionKey: HUMAN_SUPPORT_COMPLETION_ACTION_KEY,
          status: "NEW",
          assignedStaffId: null,
        },
        select: { id: true },
      });
      if (!stillWaiting) {
        result.skipped += 1;
        await releaseClaim(claimId);
        continue;
      }

      const delivery = await notifyStoreManagerOnLine({
        type: "HUMAN_SUPPORT_FINAL_REMINDER",
        eventKey,
        storeId: candidate.storeId,
        storeSlug: candidate.store.slug,
        leadId: candidate.id,
      });

      if (delivery.status === "sent") {
        result.sent += 1;
        if (delivery.failedCount > 0) result.failed += 1;
        await prisma.digitalButlerExecutionLog.update({
          where: { id: claimId },
          data: { outcome: delivery.failedCount > 0 ? "PARTIAL" : "SENT" },
        });
      } else if (delivery.status === "skipped") {
        result.skipped += 1;
        await releaseClaim(claimId);
      } else {
        result.failed += 1;
        await releaseClaim(claimId);
      }
    } catch (error) {
      result.failed += 1;
      if (claimId) await releaseClaim(claimId);
      console.error("[HumanSupportReminder] candidate failed", {
        leadId: candidate.id,
        storeId: candidate.storeId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return result;
}
