import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptDigitalButlerValue } from "@/lib/digital-butler-crypto";
import {
  getMessengerPageConfig,
  getMessengerUtilityTemplateConfig,
  messengerUtilityRemindersEnabled,
} from "@/lib/messenger-config";
import { sendMessengerUtilityTemplate } from "@/lib/messenger";

export type MessengerUtilityReminderCode =
  | "SENT"
  | "SKIPPED_DISABLED"
  | "SKIPPED_MISSING_TEMPLATE"
  | "SKIPPED_MISSING_IDENTITY"
  | "FAILED_META_REJECTED"
  | "FAILED_TRANSPORT"
  | "FAILED_CONFIGURATION"
  | "FAILED_IDENTITY_SCOPE";

export type MessengerUtilityReminderInput = {
  ruleId: string;
  templateId: string | null;
  booking: {
    id: string;
    storeId: string;
    customerId: string;
    bookingDate: Date;
    slotTime: string;
    people: number;
  };
  triggerAt: Date;
  store: { slug: string; shopName: string };
  bookingLink: string;
};

function logStatus(code: MessengerUtilityReminderCode): "SENT" | "SKIPPED" | "FAILED" {
  if (code === "SENT") return "SENT";
  return code.startsWith("SKIPPED_") ? "SKIPPED" : "FAILED";
}

async function record(input: MessengerUtilityReminderInput, code: MessengerUtilityReminderCode): Promise<void> {
  await prisma.messageLog.create({
    data: {
      ruleId: input.ruleId,
      templateId: input.templateId,
      customerId: input.booking.customerId,
      bookingId: input.booking.id,
      triggerAt: input.triggerAt,
      storeId: input.booking.storeId,
      channel: "MESSENGER",
      status: logStatus(code),
      // Codes are deliberately the only Messenger error metadata persisted.
      errorMessage: code === "SENT" ? null : code,
      sentAt: code === "SENT" ? new Date() : null,
    },
  });
}

function claimEventKey(input: MessengerUtilityReminderInput): string {
  const raw = `${input.ruleId}:${input.booking.id}:${input.triggerAt.toISOString()}`;
  return `messenger-utility-reminder:${createHash("sha256").update(raw).digest("hex")}`;
}

async function claimDelivery(input: MessengerUtilityReminderInput): Promise<string | null> {
  const eventKey = claimEventKey(input);
  try {
    const claim = await prisma.digitalButlerExecutionLog.create({
      data: {
        storeId: input.booking.storeId,
        provider: "MESSENGER",
        eventKey,
        eventType: "MESSENGER_UTILITY_REMINDER",
        outcome: "CLAIMED",
      },
      select: { id: true },
    });
    return claim.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const failedClaim = await prisma.digitalButlerExecutionLog.findUnique({
        where: { storeId_eventKey: { storeId: input.booking.storeId, eventKey } },
        select: { id: true, outcome: true },
      });
      if (failedClaim?.outcome !== "FAILED") return null;

      // A definite transport rejection is safe to retry. Delete only the
      // failed claim we observed; a concurrent worker that already reclaimed
      // it must retain ownership.
      const released = await prisma.digitalButlerExecutionLog.deleteMany({
        where: { id: failedClaim.id, outcome: "FAILED" },
      });
      if (released.count === 0) return null;
      return claimDelivery(input);
    }
    throw error;
  }
}

async function markClaimFailed(claimId: string): Promise<void> {
  await prisma.digitalButlerExecutionLog.update({
    where: { id: claimId },
    data: { outcome: "FAILED" },
  });
}

/**
 * Resolves a recipient only from the consumed opaque chat link for this exact
 * booking and store.  It never falls back to Customer name, phone, or a URL.
 */
async function loadScopedRecipient(bookingId: string, storeId: string): Promise<
  | { status: "ok"; recipientId: string }
  | { status: "missing" | "scope" }
> {
  const link = await prisma.trialBookingLink.findUnique({
    where: { bookingId },
    select: {
      storeId: true,
      channel: true,
      identityCiphertext: true,
      identityIv: true,
      identityAuthTag: true,
      identityKeyVersion: true,
    },
  });
  if (!link || link.channel !== "MESSENGER") return { status: "missing" };
  if (link.storeId !== storeId) return { status: "scope" };
  try {
    const recipientId = decryptDigitalButlerValue({
      ciphertext: Buffer.from(link.identityCiphertext),
      iv: Buffer.from(link.identityIv),
      authTag: Buffer.from(link.identityAuthTag),
      keyVersion: link.identityKeyVersion as "v1",
    }).trim();
    return recipientId ? { status: "ok", recipientId } : { status: "missing" };
  } catch {
    return { status: "missing" };
  }
}

/** Returns a safe code only; no raw API response, PSID, token, or PII is logged. */
export async function sendMessengerUtilityReminder(input: MessengerUtilityReminderInput): Promise<MessengerUtilityReminderCode> {
  if (!messengerUtilityRemindersEnabled()) {
    await record(input, "SKIPPED_DISABLED");
    return "SKIPPED_DISABLED";
  }

  const template = getMessengerUtilityTemplateConfig(input.store.slug);
  if (!template) {
    await record(input, "SKIPPED_MISSING_TEMPLATE");
    return "SKIPPED_MISSING_TEMPLATE";
  }
  const page = getMessengerPageConfig(input.store.slug);
  if (!page.pageId || !page.accessToken) {
    await record(input, "FAILED_CONFIGURATION");
    return "FAILED_CONFIGURATION";
  }
  const recipient = await loadScopedRecipient(input.booking.id, input.booking.storeId);
  if (recipient.status !== "ok") {
    const code = recipient.status === "scope" ? "FAILED_IDENTITY_SCOPE" : "SKIPPED_MISSING_IDENTITY";
    await record(input, code);
    return code;
  }

  // Claim before the external side effect. A concurrent worker, or a retry
  // after Meta accepted the message but local finalization failed, must never
  // send the same reminder twice.
  const claimId = await claimDelivery(input);
  if (!claimId) return "SENT";

  const values = {
    shopName: input.store.shopName,
    bookingDate: input.booking.bookingDate.toISOString().slice(0, 10),
    bookingTime: input.booking.slotTime,
    people: String(input.booking.people),
    bookingLink: input.bookingLink,
  };
  try {
    const result = await sendMessengerUtilityTemplate({
      pageId: page.pageId,
      pageAccessToken: page.accessToken,
      recipientId: recipient.recipientId,
      template: {
        name: template.name,
        language: template.language,
        parameters: template.parameterOrder.map((key) => values[key]),
      },
    });
    const code = result.success ? "SENT" : result.failureCode ?? "FAILED_TRANSPORT";
    if (code === "SENT") {
      await record(input, code);
      await prisma.digitalButlerExecutionLog.update({ where: { id: claimId }, data: { outcome: "SENT" } });
    } else {
      // Mark the claim retryable before writing the audit row. If audit
      // persistence fails, the backup cron can still reclaim this delivery.
      await markClaimFailed(claimId);
      await record(input, code);
    }
    return code;
  } catch (error) {
    // Transport exceptions and successful-send finalization failures leave a
    // CLAIMED guard because delivery may already have happened. Definite
    // failures were marked FAILED above and remain reclaimable even when their
    // audit write throws.
    throw error;
  }
}
