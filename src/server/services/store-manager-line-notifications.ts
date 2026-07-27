import { deriveBaseUrl } from "@/lib/base-url";
import { pushMessage, type LineMessage } from "@/lib/line";
import { prisma } from "@/lib/db";

type StoreManagerNotificationEvent =
  | {
      type: "DIGITAL_BUTLER_LEAD_CREATED";
      eventKey: string;
      storeId: string;
      storeSlug: string;
      customerName: string;
      phone: string;
      leadId: string;
    }
  | {
      type: "PUBLIC_TRIAL_BOOKING_CREATED";
      eventKey: string;
      storeId: string;
      storeSlug: string;
      customerName: string;
      phone: string;
      bookingId: string;
      bookingDate: string;
      slotTime: string;
      people: number;
      expectedAmount: number;
    }
  | {
      type: "TRANSFER_PENDING_CONFIRMATION";
      eventKey: string;
      storeId: string;
      storeSlug: string;
      customerName: string;
      paymentId: string;
      planName: string;
      amount: number;
      lastFourDigits?: string | null;
    };

export type StoreManagerNotificationResult =
  | { status: "sent"; sentCount: number; failedCount: number }
  | { status: "skipped"; reason: "recipient_not_configured" }
  | { status: "failed"; error: string };

function recipientEnvKey(storeSlug: string): string {
  return `LINE_MANAGER_USER_ID_${storeSlug.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
}

export function resolveStoreManagerLineRecipient(storeSlug: string): string | null {
  const value = process.env[recipientEnvKey(storeSlug)]?.trim();
  return value || null;
}

function formatCurrency(value: number): string {
  return `NT$${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(value)}`;
}

function managerUrl(path: string): string {
  return `${deriveBaseUrl()}${path}`;
}

export function buildStoreManagerNotificationMessage(
  event: StoreManagerNotificationEvent,
): LineMessage[] {
  switch (event.type) {
    case "DIGITAL_BUTLER_LEAD_CREATED":
      return [{
        type: "text",
        text: [
          "🙋 新詢問",
          "",
          `姓名：${event.customerName}`,
          `電話：${event.phone}`,
          "來源：LINE 數位管家",
          "目前進度：已留下聯絡資料",
          "",
          `查看名單：${managerUrl(`/dashboard/digital-butler/leads?leadId=${encodeURIComponent(event.leadId)}`)}`,
        ].join("\n"),
      }];

    case "PUBLIC_TRIAL_BOOKING_CREATED":
      return [{
        type: "text",
        text: [
          "🎉 新體驗預約",
          "",
          `姓名：${event.customerName}`,
          `電話：${event.phone}`,
          `日期：${event.bookingDate}`,
          `時間：${event.slotTime}`,
          `人數：${event.people} 位`,
          `應收：${formatCurrency(event.expectedAmount)}`,
          "來源：官網公開預約",
          "",
          `查看預約：${managerUrl(`/dashboard/bookings?bookingId=${encodeURIComponent(event.bookingId)}`)}`,
        ].join("\n"),
      }];

    case "TRANSFER_PENDING_CONFIRMATION":
      return [{
        type: "text",
        text: [
          "💰 等待確認入帳",
          "",
          `姓名：${event.customerName}`,
          `方案：${event.planName}`,
          `金額：${formatCurrency(event.amount)}`,
          `後四碼：${event.lastFourDigits?.trim() || "尚未提供"}`,
          "",
          `確認入帳：${managerUrl(`/dashboard/payments/pending?paymentId=${encodeURIComponent(event.paymentId)}`)}`,
        ].join("\n"),
      }];
  }
}

/**
 * Best-effort notification boundary.
 * Business data must already be committed before this function is called.
 * Delivery failure is reported and logged, but never throws back into the
 * customer-facing lead, booking, or payment flow.
 */
export async function notifyStoreManagerOnLine(
  event: StoreManagerNotificationEvent,
): Promise<StoreManagerNotificationResult> {
  const configured = await prisma.storeLineNotificationRecipient.findMany({
    where: { storeId: event.storeId, isActive: true, lineUserId: { not: null } },
    select: { lineUserId: true },
  });
  const legacyRecipient = resolveStoreManagerLineRecipient(event.storeSlug);
  const recipientLineUserIds = [
    ...new Set([
      ...configured.flatMap((item) => item.lineUserId ? [item.lineUserId] : []),
      ...(legacyRecipient ? [legacyRecipient] : []),
    ]),
  ];
  if (recipientLineUserIds.length === 0) {
    console.warn("[StoreManagerLineNotification] recipient not configured", {
      eventType: event.type,
      eventKey: event.eventKey,
      storeId: event.storeId,
      storeSlug: event.storeSlug,
      envKey: recipientEnvKey(event.storeSlug),
    });
    return { status: "skipped", reason: "recipient_not_configured" };
  }

  let sentCount = 0;
  const errors: string[] = [];
  for (const recipientLineUserId of recipientLineUserIds) {
    try {
      const result = await pushMessage(
        event.storeId,
        recipientLineUserId,
        buildStoreManagerNotificationMessage(event),
      );
      if (result.success) sentCount += 1;
      else errors.push(result.error ?? "LINE delivery failed");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown LINE delivery error");
    }
  }
  if (sentCount > 0) return { status: "sent", sentCount, failedCount: errors.length };
  const error = errors[0] ?? "LINE delivery failed";
  console.error("[StoreManagerLineNotification] delivery failed", {
    eventType: event.type, eventKey: event.eventKey, storeId: event.storeId, error,
  });
  return { status: "failed", error };
}
