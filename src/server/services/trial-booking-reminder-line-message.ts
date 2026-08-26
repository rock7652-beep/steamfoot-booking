import type { LineMessage, LinePushResult } from "@/lib/line";

const REMINDER_CARD_COLORS = {
  headerBackground: "#F3EDE5",
  headerText: "#4B433B",
  headerSubtext: "#756B62",
  primary: "#667A5C",
  reschedule: "#8B6B52",
  cancel: "#AD5F58",
  testBadgeBackground: "#E9D9B9",
  testBadgeText: "#5A421F",
} as const;

export type PackageBookingReminderCard = {
  customerName: string;
  bookingDate: string;
  bookingTime: string;
  shopName: string;
  serviceName: string;
  serviceDuration: string;
  address?: string;
  mapUrl?: string;
  reminderText?: string;
  recurrenceIndex?: number;
  recurrenceTotalOccurrences?: number;
};

export type TrialBookingReminderCard = {
  customerName: string;
  bookingDate: string;
  bookingTime: string;
  shopName: string;
  serviceName: string;
  mapUrl?: string;
  reminderText?: string;
};

/**
 * Action URLs deliberately stay out of the visible message body. The linked
 * customer pages re-check login identity, store, ownership and the 12-hour
 * cutoff before allowing any write.
 */
export function buildPackageBookingReminderLineMessages(
  card: PackageBookingReminderCard,
  managementUrl: string,
  bookingId: string,
): LineMessage[] {
  return buildPackageBookingTestReminderLineMessages(card, managementUrl, bookingId, false);
}

export function buildPackageBookingTestReminderLineMessages(
  card: PackageBookingReminderCard,
  managementUrl: string,
  bookingId: string,
  isTest = true,
): LineMessage[] {
  const actionUrl = (action: "cancel" | "reschedule") => {
    const url = new URL(managementUrl);
    url.pathname = `${url.pathname.replace(/\/$/, "")}/${encodeURIComponent(bookingId)}/${action}`;
    return url.toString();
  };

  return [{
    type: "flex",
    altText: isTest
      ? `【測試提醒｜不影響正式排程】${card.customerName} 的預約：${card.bookingDate} ${card.bookingTime}`
      : `${card.customerName} 的預約提醒：${card.bookingDate} ${card.bookingTime}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: REMINDER_CARD_COLORS.headerBackground,
        paddingAll: "16px",
        contents: [
          { type: "text", text: "蒸管家｜預約提醒", color: REMINDER_CARD_COLORS.headerText, weight: "bold", size: "lg" },
          ...(card.recurrenceIndex && card.recurrenceTotalOccurrences
            ? [{
                type: "text" as const,
                text: `每週固定預約・第 ${card.recurrenceIndex}/${card.recurrenceTotalOccurrences} 次`,
                color: REMINDER_CARD_COLORS.headerSubtext,
                size: "sm" as const,
                weight: "bold" as const,
                margin: "sm",
              }]
            : []),
          ...(isTest
            ? [{
                type: "box" as const,
                layout: "horizontal" as const,
                margin: "md",
                backgroundColor: REMINDER_CARD_COLORS.testBadgeBackground,
                cornerRadius: "12px",
                paddingAll: "8px",
                contents: [
                  { type: "text" as const, text: "測試提醒｜不影響正式排程", color: REMINDER_CARD_COLORS.testBadgeText, size: "xs" as const, weight: "bold" as const },
                ],
              }]
            : []),
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: `${card.customerName} 您好`, weight: "bold", size: "lg" },
          { type: "separator" },
          detailRow("日期時間", `${card.bookingDate} ${card.bookingTime}`),
          detailRow("店名", card.shopName),
          detailRow("預約項目", card.serviceName),
          detailRow("服務時間", card.serviceDuration),
          ...(card.address ? [detailRow("地址", card.address)] : []),
          ...(card.reminderText
            ? [
                { type: "separator" },
                { type: "text", text: "提醒內容", color: "#8A817A", size: "sm" },
                { type: "text", text: card.reminderText, color: "#302924", size: "sm", wrap: true },
              ]
            : []),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          ...(card.mapUrl
            ? [{
                type: "button",
                style: "primary",
                color: REMINDER_CARD_COLORS.primary,
                action: { type: "uri", label: "開啟 Google Maps 導航", uri: card.mapUrl },
              }]
            : []),
          {
            type: "button",
            style: "primary",
            color: REMINDER_CARD_COLORS.reschedule,
            action: { type: "uri", label: "改時段", uri: actionUrl("reschedule") },
          },
          {
            type: "button",
            style: "primary",
            color: REMINDER_CARD_COLORS.cancel,
            action: { type: "uri", label: "取消前往", uri: actionUrl("cancel") },
          },
        ],
      },
    },
  }];
}

export function buildTrialBookingReminderLineMessages(
  card: TrialBookingReminderCard,
  managementUrl: string,
): LineMessage[] {
  const actionUrl = (action: "confirm" | "cancel" | "reschedule") => {
    const url = new URL(managementUrl);
    url.searchParams.set("action", action);
    return url.toString();
  };
  return [{
    type: "flex",
    altText: `${card.customerName} 的預約提醒：${card.bookingDate} ${card.bookingTime}。請開啟訊息確認、改期或取消。`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: REMINDER_CARD_COLORS.headerBackground,
        paddingAll: "16px",
        contents: [
          { type: "text", text: "蒸管家｜預約提醒", color: REMINDER_CARD_COLORS.headerText, weight: "bold", size: "lg" },
          { type: "text", text: "請確認明日行程", color: REMINDER_CARD_COLORS.headerSubtext, size: "sm", margin: "sm" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: `${card.customerName} 您好`, weight: "bold", size: "lg" },
          { type: "separator" },
          detailRow("日期時間", `${card.bookingDate} ${card.bookingTime}`),
          detailRow("店名", card.shopName),
          detailRow("預約項目", card.serviceName),
          ...(card.reminderText
            ? [
                { type: "separator" },
                { type: "text", text: "提醒內容", color: "#8A817A", size: "sm" },
                { type: "text", text: card.reminderText, color: "#302924", size: "sm", wrap: true },
              ]
            : []),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          ...(card.mapUrl
            ? [{
                type: "button" as const,
                style: "primary" as const,
                color: REMINDER_CARD_COLORS.primary,
                action: { type: "uri" as const, label: "開啟 Google Maps 導航", uri: card.mapUrl },
              }]
            : []),
          {
            type: "button",
            style: "primary",
            color: REMINDER_CARD_COLORS.primary,
            action: { type: "uri", label: "確認會到", uri: actionUrl("confirm") },
          },
          {
            type: "button",
            style: "primary",
            color: REMINDER_CARD_COLORS.reschedule,
            action: { type: "uri", label: "需要改期", uri: actionUrl("reschedule") },
          },
          {
            type: "button",
            style: "primary",
            color: REMINDER_CARD_COLORS.cancel,
            action: { type: "uri", label: "取消預約", uri: actionUrl("cancel") },
          },
        ],
      },
    },
  }];
}

/**
 * This is only used after a definitive Flex rejection. It deliberately keeps
 * the existing signed management flow available as a normal text link for
 * clients that cannot render Flex cards.
 */
export function buildTrialBookingReminderTextFallback(
  card: TrialBookingReminderCard,
  managementUrl: string,
  prefix = "",
): LineMessage[] {
  return [{
    type: "text",
    text: `${prefix}${card.customerName} 您好！\n\n明天 ${card.bookingDate} ${card.bookingTime} 有一筆 ${card.serviceName} 預約。\n店名：${card.shopName}${card.reminderText ? `\n提醒內容：${card.reminderText}` : ""}${card.mapUrl ? `\nGoogle Maps 導航：${card.mapUrl}` : ""}\n\n請開啟以下安全連結，確認會到、改期或取消：\n${managementUrl}`,
  }];
}

function detailRow(label: string, value: string): Record<string, unknown> {
  return {
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      { type: "text", text: label, color: "#8A817A", size: "sm", flex: 3 },
      { type: "text", text: value, color: "#302924", size: "sm", wrap: true, flex: 7 },
    ],
  };
}

/**
 * A 4xx rejection is definitive: LINE did not accept the Flex payload, so it
 * is safe to make one text-only attempt. Network errors and 5xx responses are
 * intentionally not retried because delivery may be unknown.
 */
export function canFallbackToTextReminder(result: LinePushResult): boolean {
  return result.success === false
    && result.errorType === "line_api_rejected"
    && result.httpStatus !== undefined
    && result.httpStatus >= 400
    && result.httpStatus < 500;
}
