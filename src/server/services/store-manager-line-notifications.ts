import { deriveBaseUrl } from "@/lib/base-url";
import { pushMessage, type LineMessage } from "@/lib/line";
import { prisma } from "@/lib/db";
import { providerNotificationLabel } from "@/lib/digital-butler-provider";

type StoreManagerNotificationEvent =
  | {
      type: "DIGITAL_BUTLER_LEAD_CREATED";
      eventKey: string;
      storeId: string;
      storeSlug: string;
      customerName: string;
      phone: string;
      leadId: string;
      provider: string | null;
      requestType: string;
      storeName: string;
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
    }
  | {
      type: "HUMAN_SUPPORT_REQUESTED";
      eventKey: string;
      storeId: string;
      storeSlug: string;
      leadId: string;
      provider: string | null;
    }
  | {
      type: "HUMAN_SUPPORT_FINAL_REMINDER";
      eventKey: string;
      storeId: string;
      storeSlug: string;
      leadId: string;
    }
  | {
      type: "INCOMPLETE_SERVICE_REMINDER";
      eventKey: string;
      storeId: string;
      storeSlug: string;
      bookingId: string;
      customerName: string;
      bookingDate: string;
      slotTime: string;
    }
  | {
      type: "DAILY_ACTION_DIGEST";
      eventKey: string;
      storeId: string;
      storeSlug: string;
      pendingPaymentCount: number;
      incompleteServiceCount: number;
      waitingSupportCount?: number;
      waitingSupportDetails?: Array<{ name: string; provider: string | null; lastMessageAt: Date | null }>;
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

function supportLeadUrl(leadId: string): string {
  return managerUrl(`/dashboard/digital-butler/leads?leadId=${encodeURIComponent(leadId)}`);
}

function waitingHumanSupportUrl(): string {
  return managerUrl("/dashboard/digital-butler/leads?handoff=waiting");
}

function bookingUrl(bookingId: string): string {
  return managerUrl(`/dashboard/bookings?bookingId=${encodeURIComponent(bookingId)}`);
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
          `需求：${event.requestType}`,
          `來源：${providerNotificationLabel(event.provider)}`,
          `店別：${event.storeName}`,
          "目前進度：已留下聯絡資料",
          "",
          `查看名單：${supportLeadUrl(event.leadId)}`,
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
          `查看預約：${bookingUrl(event.bookingId)}`,
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
          `前往後台確認：${managerUrl(`/dashboard/payments?transactionId=${encodeURIComponent(event.paymentId)}`)}`,
        ].join("\n"),
      }];

    case "HUMAN_SUPPORT_REQUESTED":
      return [{
        type: "text",
        text: [
          "🙋 顧客要求真人客服",
          "",
          `來源：${providerNotificationLabel(event.provider)}`,
          "狀態：等待門市夥伴接手",
          "",
          `前往後台接手：${waitingHumanSupportUrl()}`,
        ].join("\n"),
      }];

    case "HUMAN_SUPPORT_FINAL_REMINDER":
      return [{
        type: "text",
        text: [
          "⚠️ 真人客服仍未接手",
          "",
          "已等待超過 30 分鐘。",
          "這是最後一次即時提醒，後續會保留在今日待辦。",
          "",
          `前往後台接手：${waitingHumanSupportUrl()}`,
        ].join("\n"),
      }];

    case "INCOMPLETE_SERVICE_REMINDER":
      return [{
        type: "text",
        text: [
          "🔔 服務尚未完成",
          "",
          `顧客：${event.customerName}`,
          `預約日期：${event.bookingDate}`,
          `預約時間：${event.slotTime}`,
          "狀態：服務時段結束後仍未完成",
          "",
          `前往後台處理：${bookingUrl(event.bookingId)}`,
        ].join("\n"),
      }];

    case "DAILY_ACTION_DIGEST": {
      const waitingSupportCount = event.waitingSupportCount ?? 0;
      const total = event.pendingPaymentCount + event.incompleteServiceCount + waitingSupportCount;
      const lines = ["☀️ 今日待辦", ""];
      if (event.pendingPaymentCount > 0) lines.push(`💰 待確認付款：${event.pendingPaymentCount} 筆`);
      if (event.incompleteServiceCount > 0) lines.push(`🔔 昨日未完成服務：${event.incompleteServiceCount} 筆`);
      if (waitingSupportCount > 0) lines.push(`🙋 尚未接手客服：${waitingSupportCount} 位`);
      for (const item of (event.waitingSupportDetails ?? []).slice(0, 5)) {
        lines.push(`・${item.name}｜${providerNotificationLabel(item.provider)}｜想找真人客服${item.lastMessageAt ? `｜${item.lastMessageAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}` : ""}`);
      }
      lines.push("", `共 ${total} 件待處理`);
      if (waitingSupportCount > 0) lines.push(``, `前往接手客服：${waitingHumanSupportUrl()}`);
      else lines.push("", `前往後台：${managerUrl("/dashboard")}`);
      return [{ type: "text", text: lines.join("\n") }];
    }
  }
}

/**
 * Best-effort notification boundary.
 * Business data must already be committed before this function is called.
 * Delivery failure is reported and logged, but never throws back into the
 * customer-facing lead, booking, payment, or handoff flow.
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
