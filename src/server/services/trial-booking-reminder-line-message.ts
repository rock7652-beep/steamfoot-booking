import type { LineMessage, LinePushResult } from "@/lib/line";

export type PackageBookingReminderCard = {
  customerName: string;
  bookingDate: string;
  bookingTime: string;
  shopName: string;
  serviceName: string;
  reminderText: string;
};

export type TrialBookingReminderCard = {
  customerName: string;
  bookingDate: string;
  bookingTime: string;
  shopName: string;
  serviceName: string;
};

/**
 * The signed management URL deliberately stays out of the visible message
 * body. Each button opens the same existing self-service page, which remains
 * the single authority for identity verification and action restrictions.
 */
export function buildPackageBookingTestReminderLineMessages(
  card: PackageBookingReminderCard,
  managementUrl: string,
): LineMessage[] {
  return [{
    type: "flex",
    altText: `【測試提醒｜不影響正式排程】${card.customerName} 的預約：${card.bookingDate} ${card.bookingTime}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#5C4634",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "蒸管家｜預約提醒", color: "#FFFFFF", weight: "bold", size: "lg" },
          { type: "text", text: "測試提醒｜不影響正式排程", color: "#F4E9DF", size: "sm", margin: "sm" },
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
          { type: "separator" },
          { type: "text", text: "提醒內容", color: "#8A817A", size: "sm" },
          { type: "text", text: card.reminderText, color: "#302924", size: "sm", wrap: true },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [{
          type: "button",
          style: "primary",
          color: "#5C4634",
          action: { type: "uri", label: "查看／管理預約", uri: managementUrl },
        }],
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
        backgroundColor: "#5C4634",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "蒸管家｜預約提醒", color: "#FFFFFF", weight: "bold", size: "lg" },
          { type: "text", text: "請確認明日行程", color: "#F4E9DF", size: "sm", margin: "sm" },
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
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#5C4634",
            action: { type: "uri", label: "確認會到", uri: actionUrl("confirm") },
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "uri", label: "需要改期", uri: actionUrl("reschedule") },
          },
          {
            type: "button",
            style: "secondary",
            color: "#A33A32",
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
    text: `${prefix}${card.customerName} 您好！\n\n明天 ${card.bookingDate} ${card.bookingTime} 有一筆 ${card.serviceName} 預約。\n店名：${card.shopName}\n\n請開啟以下安全連結，確認會到、改期或取消：\n${managementUrl}`,
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
