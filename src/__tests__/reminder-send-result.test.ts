import { describe, expect, it } from "vitest";

import {
  formatManagerNotificationResult,
  formatReminderSendResult,
} from "@/lib/reminder-send-result";

describe("formatReminderSendResult", () => {
  it.each([
    ["SKIPPED", "LINE recipient unavailable: NO_CENTRAL_USER", "未綁定 LINE"],
    ["SKIPPED", "LINE recipient unavailable: NO_CENTRAL_LINE", "未綁定 LINE"],
    ["FAILED", 'LINE API 400: {"message":"Failed to send messages"}', "已綁定但無法送達"],
    ["SENT", "LINE API 400", "已發送"],
  ])("maps %s result without exposing the technical detail", (status, errorMessage, expected) => {
    expect(formatReminderSendResult(status, errorMessage)).toBe(expected);
  });

  it("keeps existing plain-language skipped explanations", () => {
    expect(formatReminderSendResult("SKIPPED", "該分店已停用此類提醒")).toBe("該分店已停用此類提醒");
  });

  it("uses a plain-language fallback for other technical skip details", () => {
    expect(formatReminderSendResult("SKIPPED", "Feature not enabled")).toBe("此功能尚未啟用");
    expect(formatReminderSendResult("SKIPPED", "UNKNOWN_INTERNAL_CODE")).toBe("已跳過");
  });
});

describe("formatManagerNotificationResult", () => {
  it.each([
    ["FAILED", "店長尚未綁定可接收通知的 LINE", "未綁定 LINE"],
    ["FAILED", "LINE API 400", "已綁定但無法送達"],
    ["FAILED", "LINE API 500", "通知失敗"],
    ["SENT", null, "已發送"],
    [null, null, "不需通知"],
  ])("formats manager status %s independently", (status, errorMessage, expected) => {
    expect(formatManagerNotificationResult(status, errorMessage)).toBe(expected);
  });

  it("keeps the customer result independent from a failed manager notification", () => {
    expect(formatReminderSendResult("SENT", null)).toBe("已發送");
    expect(formatManagerNotificationResult("FAILED", "店長尚未綁定可接收通知的 LINE")).toBe("未綁定 LINE");
  });

  it("marks a required manager notification with no persisted outcome as pending confirmation", () => {
    expect(formatManagerNotificationResult(null, null, "VIP_INTEREST")).toBe("通知結果待確認");
  });

  it.each(["FAILED", "SKIPPED"]) ("keeps failed or skipped customer results separate from manager status: %s", (status) => {
    expect(formatReminderSendResult(status, "LINE API 500")).not.toBe("已發送");
  });
});
