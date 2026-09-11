import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { deriveBaseUrl } from "@/lib/base-url";
import { getSpaDemoLineTestRecipient } from "@/lib/line-config";
import { pushSteamButlerMessage } from "@/lib/line";
import {
  SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
  SPA_DEMO_LIVE_FLOW_NOTIFICATION_ID,
  SPA_DEMO_STORE,
  type SpaDemoBookingNotification,
} from "@/lib/spa-demo-store";
import { buildSpaDemoBookingLineMessages } from "@/server/services/spa-demo-line-message";

export type SpaDemoNotificationClaim = {
  messageLogId: string;
  shouldSend: boolean;
};

function notificationMessageLogId(
  bookingId: string,
  notification: SpaDemoBookingNotification,
) {
  const eventKey = createHash("sha256")
    .update(`${bookingId}:${JSON.stringify(notification)}`)
    .digest("hex")
    .slice(0, 16);
  return `${SPA_DEMO_LIVE_FLOW_NOTIFICATION_ID}-${eventKey}`;
}

export async function saveSpaDemoBookingNotification(
  tx: Prisma.TransactionClient,
  bookingId: string,
  notification: SpaDemoBookingNotification,
): Promise<SpaDemoNotificationClaim> {
  const renderedBody = JSON.stringify(notification);
  const messageLogId = notificationMessageLogId(bookingId, notification);
  const existing = await tx.messageLog.findUnique({
    where: { id: messageLogId },
    select: { renderedBody: true, status: true, storeId: true, customerId: true },
  });
  if (existing && (existing.storeId !== SPA_DEMO_STORE.id || existing.customerId !== SPA_DEMO_LIVE_FLOW_CUSTOMER_ID)) {
    throw new Error("SPA_DEMO_NOTIFICATION_ID_COLLISION");
  }
  if (existing?.renderedBody === renderedBody && existing.status === "SENT") {
    return { messageLogId, shouldSend: false };
  }

  await tx.messageLog.upsert({
    where: { id: messageLogId },
    create: {
      id: messageLogId,
      storeId: SPA_DEMO_STORE.id,
      customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
      spaBookingId: bookingId,
      channel: "LINE",
      status: "PENDING",
      renderedBody,
    },
    update: {
      storeId: SPA_DEMO_STORE.id,
      customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
      bookingId: null,
      spaBookingId: bookingId,
      channel: "LINE",
      status: "PENDING",
      renderedBody,
      errorMessage: null,
      sentAt: null,
    },
  });
  return { messageLogId, shouldSend: true };
}

export async function deliverSpaDemoBookingNotification(claim: SpaDemoNotificationClaim) {
  if (!claim.shouldSend || process.env.VERCEL_ENV === "production") return "NOOP" as const;

  const enabled = process.env.SPA_DEMO_LINE_TEST_SEND_ENABLED?.trim().toLowerCase() !== "false";
  const recipientLineUserId = getSpaDemoLineTestRecipient();
  if (!enabled) {
    await prisma.messageLog.updateMany({
      where: {
        id: claim.messageLogId,
        storeId: SPA_DEMO_STORE.id,
        customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
        status: "PENDING",
      },
      data: { status: "SKIPPED", errorMessage: "SPA_DEMO_LINE_TEST_SEND_DISABLED" },
    });
    return "SKIPPED" as const;
  }
  if (!recipientLineUserId) {
    await prisma.messageLog.updateMany({
      where: {
        id: claim.messageLogId,
        storeId: SPA_DEMO_STORE.id,
        customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
        status: "PENDING",
      },
      data: {
        status: "SKIPPED",
        sentAt: new Date(),
        errorMessage: "SPA_DEMO_SIMULATED_DELIVERY",
      },
    });
    return "SIMULATED" as const;
  }

  const log = await prisma.messageLog.findFirst({
    where: {
      id: claim.messageLogId,
      storeId: SPA_DEMO_STORE.id,
      customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
      status: { in: ["PENDING", "FAILED", "SKIPPED"] },
    },
    select: { renderedBody: true },
  });
  if (!log?.renderedBody) return "NOOP" as const;

  const notification = JSON.parse(log.renderedBody) as SpaDemoBookingNotification;
  const bookingUrl = `${deriveBaseUrl()}/s/demo/liff/design-preview/booking`;
  const result = await pushSteamButlerMessage(
    recipientLineUserId,
    buildSpaDemoBookingLineMessages(notification, bookingUrl),
  );
  if (!result.success) {
    console.error("[spa-demo-line] delivery failed", {
      error: result.error ?? "LINE_DELIVERY_FAILED",
      httpStatus: result.httpStatus ?? null,
      errorType: result.errorType ?? null,
    });
  }
  await prisma.messageLog.updateMany({
    where: { id: claim.messageLogId, storeId: SPA_DEMO_STORE.id, customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID },
    data: {
      status: result.success ? "SENT" : "FAILED",
      sentAt: result.success ? new Date() : null,
      errorMessage: result.success ? null : (result.error ?? "LINE_DELIVERY_FAILED").slice(0, 500),
      lineRoute: "CENTRAL",
    },
  });
  return result.success ? "SENT" as const : "FAILED" as const;
}

export async function deliverSpaDemoBookingNotificationBestEffort(
  claim: SpaDemoNotificationClaim,
) {
  try {
    return await deliverSpaDemoBookingNotification(claim);
  } catch (error) {
    await prisma.messageLog.updateMany({
      where: {
        id: claim.messageLogId,
        storeId: SPA_DEMO_STORE.id,
        customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
      },
      data: {
        status: "FAILED",
        sentAt: null,
        errorMessage: (error instanceof Error ? error.message : "LINE_DELIVERY_FAILED").slice(0, 500),
      },
    }).catch(() => undefined);
    return "FAILED" as const;
  }
}
