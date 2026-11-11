import { expect, it } from "vitest";
import { getLineNotificationStatus, lineNotificationExplanation, lineNotificationLabel, lineNotificationShortLabel } from "@/lib/line-notification-status";

it.each([
  ["UNLINKED", "retained-recipient", "needs_review", "待核對"],
  ["LINKED", null, "needs_review", "待核對"],
  ["UNLINKED", null, "disabled", "未連結"],
  ["LINKED", "confirmed-recipient", "enabled", "已連結"],
  ["BLOCKED", "blocked-recipient", "error", "已封鎖"],
  ["BLOCKED", null, "error", "已封鎖"],
] as const)("describes notification evidence without inferring a Login failure (%s/%s)", (lineLinkStatus, lineUserId, expected, label) => {
  const input = Object.freeze({ lineLinkStatus, lineUserId });
  const status = getLineNotificationStatus(input);
  expect(status).toBe(expected);
  expect(lineNotificationShortLabel(status)).toBe(label);
  expect(lineNotificationExplanation(status)).toContain("不代表會員登入或家長查看學員的權限");
  expect(lineNotificationLabel(status)).not.toContain("異常");
});

it("keeps explicit manual review ahead of an otherwise linked notification", () => {
  expect(getLineNotificationStatus({ lineLinkStatus: "LINKED", lineUserId: "recipient", needsManualReview: true })).toBe("needs_review");
});

it("does not present an existing identifier as confirmation of notification delivery", () => {
  expect(lineNotificationExplanation("enabled")).toContain("是否可發送仍依通道與通知設定確認");
  expect(lineNotificationExplanation("needs_review")).toContain("尚不能確認可通知");
});
