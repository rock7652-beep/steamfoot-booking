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
  // A retained LINE recipient without a confirmed notification link is
  // incomplete evidence, not a failed delivery or a failed Login.
  if (input.lineUserId && input.lineLinkStatus !== "LINKED") return "needs_review";
  return "disabled";
}

export function lineNotificationLabel(status: LineNotificationStatus): string {
  switch (status) {
    case "enabled":
      return "已連結通知";
    case "disabled":
      return "尚未連結通知";
    case "error":
      return "已封鎖通知";
    case "needs_review":
      return "通知連結待核對";
  }
}

export function lineNotificationShortLabel(status: LineNotificationStatus): string {
  return { enabled: "已連結", disabled: "未連結", error: "已封鎖", needs_review: "待核對" }[status];
}

export function lineNotificationExplanation(status: LineNotificationStatus): string {
  const detail = {
    enabled: "本店 LINE 通知已連結；是否可發送仍依通道與通知設定確認。",
    disabled: "尚未連結本店 LINE 通知。",
    error: "本店 LINE 通知已標記封鎖，無法通知。",
    needs_review: "LINE 識別資料與通知連結狀態需核對，尚不能確認可通知。",
  }[status];
  return `${detail}此欄不代表會員登入或家長查看學員的權限。`;
}
