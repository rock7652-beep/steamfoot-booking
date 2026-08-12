import type { LineMessage } from "@/lib/line";

/**
 * The signed management URL deliberately stays out of the visible message
 * body. Each button opens the same existing self-service page, which remains
 * the single authority for identity verification and action restrictions.
 */
export function buildTrialBookingReminderLineMessages(
  text: string,
  managementUrl: string,
): LineMessage[] {
  return [{
    type: "flex",
    altText: "體驗預約管理：確認、取消或改期",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [{
          type: "text",
          text,
          wrap: true,
        }],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            action: { type: "uri", label: "確認預約", uri: managementUrl },
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "uri", label: "取消預約", uri: managementUrl },
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "uri", label: "改期預約", uri: managementUrl },
          },
        ],
      },
    },
  }];
}
