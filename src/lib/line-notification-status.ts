import type { LineLinkStatus } from "@prisma/client";

export type LineNotificationStatus =
  | "enabled"
  | "disabled"
  | "error"
  | "needs_review";

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
