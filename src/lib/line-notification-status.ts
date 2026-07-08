import type { LineLinkStatus } from "@prisma/client";

export type LineNotificationStatus =
  | "enabled"
  | "disabled"
  | "error"
  | "needs_review";

export const LINE_BINDING_MESSAGE =
  "您好～為了讓您可以收到預約提醒與方案通知，請先加入我們的系統自動通知 https://lin.ee/TwKLkW8，並依照畫面輸入手機號碼完成系統通知綁定。完成後，系統會自動對應到您的顧客資料，之後預約提醒與方案通知就會正常收到囉";

export function getLineNotificationStatus(input: {
  lineLinkStatus: LineLinkStatus | string;
  lineUserId?: string | null;
  needsManualReview?: boolean;
}): LineNotificationStatus {
  if (input.needsManualReview) return "needs_review";
  if (input.lineLinkStatus === "BLOCKED") return "error";
  if (input.lineLinkStatus === "LINKED" && input.lineUserId) return "enabled";
  if (input.lineLinkStatus === "LINKED" && !input.lineUserId) return "needs_review";
  if (input.lineUserId && input.lineLinkStatus !== "LINKED") return "error";
  return "disabled";
}

export function lineNotificationLabel(status: LineNotificationStatus): string {
  switch (status) {
    case "enabled":
      return "已開啟通知";
    case "disabled":
      return "未開啟通知";
    case "error":
      return "通知異常";
    case "needs_review":
      return "需人工確認";
  }
}
