import { describe, expect, it } from "vitest";

import { formatReminderSendResult } from "@/lib/reminder-send-result";

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
