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

  it.each([
    "LINE token not configured for store",
    "TRIAL_BOOKING_ACTION_SECRET_NOT_CONFIGURED",
    'LINE API 401: {"message":"Authentication failed"}',
  ])("shows LINE configuration failure %s as actionable", (detail) => {
    const result = formatReminderSendResult("FAILED", detail);
    expect(result).toBe("LINE 發送設定不完整，請聯絡系統管理員");
    expect(result).not.toBe("發送失敗");
    expect(result).not.toContain(detail);
  });

  it.each([
    "CENTRAL_USER_INACTIVE",
    "LINE recipient unavailable: CENTRAL_USER_INACTIVE",
  ])("shows inactive central LINE account without exposing %s", (detail) => {
    const result = formatReminderSendResult("SKIPPED", detail);
    expect(result).toBe("中央會員已停用或不存在");
    expect(result).not.toBe("已跳過");
    expect(result).not.toContain("CENTRAL_USER_INACTIVE");
  });

  it("keeps existing plain-language skipped explanations", () => {
    expect(formatReminderSendResult("SKIPPED", "該分店已停用此類提醒")).toBe("該分店已停用此類提醒");
  });

  it("uses a plain-language fallback for other technical skip details", () => {
    expect(formatReminderSendResult("SKIPPED", "Feature not enabled")).toBe("此功能尚未啟用");
    expect(formatReminderSendResult("SKIPPED", "UNKNOWN_INTERNAL_CODE")).toBe("已跳過");
  });

  it.each([
    ["SKIPPED_DISABLED", "Messenger 自動提醒目前關閉"],
    ["SKIPPED_MISSING_TEMPLATE", "Messenger 的核准提醒範本尚未設定"],
    ["SKIPPED_MISSING_IDENTITY", "這筆預約沒有可驗證的 Messenger 身分"],
  ])("keeps Messenger skip reason %s actionable", (code, expected) => {
    expect(formatReminderSendResult("SKIPPED", code)).toBe(expected);
  });

  it.each([
    ["FAILED", "SKIPPED_MISSING_TEMPLATE", "Messenger 的核准提醒範本尚未設定"],
    ["FAILED", "SKIPPED_MISSING_IDENTITY", "這筆預約沒有可驗證的 Messenger 身分"],
    ["FAILED", "FAILED_CONFIGURATION", "Messenger Page 設定不完整"],
    ["FAILED", "FAILED_IDENTITY_SCOPE", "Messenger 身分與此分店不一致"],
  ])("keeps manual Messenger test result %s actionable despite %s status", (status, code, expected) => {
    expect(formatReminderSendResult(status, code)).toBe(expected);
  });

  it.each([
    "CENTRAL_USER_CONFLICT",
    "CENTRAL_LINE_CONFLICT",
    "IDENTITY_LINK_CONFLICT",
    "LEGACY_LINE_CONFLICT",
  ])("shows %s as an identity conflict requiring manual review", (code) => {
    const result = formatReminderSendResult("SKIPPED", code);
    expect(result).toBe("LINE 身分資料衝突，請聯絡客服協助處理");
    expect(result).not.toBe("已跳過");
    expect(result).not.toContain(code);
  });

  it.each([
    "CENTRAL_USER_CONFLICT",
    "CENTRAL_LINE_CONFLICT",
    "IDENTITY_LINK_CONFLICT",
    "LEGACY_LINE_CONFLICT",
  ])("classifies prefixed scheduled conflict %s", (code) => {
    const result = formatReminderSendResult(
      "SKIPPED",
      `LINE recipient unavailable: ${code}`,
    );
    expect(result).toBe("LINE 身分資料衝突，請聯絡客服協助處理");
    expect(result).not.toBe("已跳過");
    expect(result).not.toContain(code);
  });

  it.each(["network", "401", "403", "429", "503"]) (
    "maps unavailable LINE verification %s without exposing its technical detail",
    (reason) => {
      const result = formatReminderSendResult(
        "SKIPPED",
        `store_channel_verification_unavailable:${reason}`,
      );
      expect(result).toBe("LINE 驗證暫時無法完成，請稍後重試");
      expect(result).not.toBe("已跳過");
      expect(result).not.toContain(reason);
    },
  );

  it.each(["network", "401", "403", "429", "503"]) (
    "maps prefixed scheduled LINE verification %s",
    (reason) => {
      const result = formatReminderSendResult(
        "SKIPPED",
        `LINE recipient unavailable: store_channel_verification_unavailable:${reason}`,
      );
      expect(result).toBe("LINE 驗證暫時無法完成，請稍後重試");
      expect(result).not.toBe("已跳過");
      expect(result).not.toContain(reason);
    },
  );
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
