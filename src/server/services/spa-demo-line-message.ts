import type { LineMessage } from "@/lib/line";
import type { SpaDemoBookingNotification } from "@/lib/spa-demo-store";

const COLORS = {
  header: "#F3EDE5",
  text: "#4B433B",
  secondary: "#756B62",
  primary: "#667A5C",
} as const;

function detailRow(label: string, value: string) {
  return {
    type: "box" as const,
    layout: "horizontal" as const,
    spacing: "md",
    contents: [
      { type: "text" as const, text: label, size: "sm" as const, color: COLORS.secondary, flex: 2 },
      { type: "text" as const, text: value, size: "sm" as const, color: COLORS.text, wrap: true, flex: 5 },
    ],
  };
}

export function buildSpaDemoBookingLineMessages(
  notification: SpaDemoBookingNotification,
  bookingUrl: string,
): LineMessage[] {
  const isCancelled = notification.kind === "CANCELLED";
  return [{
    type: "flex",
    altText: `${notification.title}：${notification.date} ${notification.time}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.header,
        paddingAll: "16px",
        contents: [
          { type: "text", text: "沐光舒療 SPA", color: COLORS.text, weight: "bold", size: "lg" },
          { type: "text", text: notification.title, color: COLORS.secondary, size: "sm", margin: "sm" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          detailRow("日期時間", `${notification.date} ${notification.time}`),
          { type: "separator" },
          ...notification.lines.map((line) => ({ type: "text" as const, text: line, size: "sm" as const, color: COLORS.text, wrap: true })),
          { type: "separator" },
          { type: "text", text: notification.summary, size: "sm", color: COLORS.text, weight: "bold", wrap: true },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [{
          type: "button",
          style: "primary",
          color: COLORS.primary,
          action: {
            type: "uri",
            label: isCancelled ? "查看預約" : "查看／修改／取消預約",
            uri: bookingUrl,
          },
        }],
      },
    },
  }];
}
