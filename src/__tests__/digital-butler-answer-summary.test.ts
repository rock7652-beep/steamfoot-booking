import { describe, expect, it } from "vitest";
import { digitalButlerAnswerSummary } from "@/lib/digital-butler-answer-summary";

describe("digitalButlerAnswerSummary", () => {
  it("shows free-text and single-choice answers with Chinese field labels", () => {
    expect(digitalButlerAnswerSummary({
      name: "黃彥陸",
      service: { value: "steam-foot", label: "蒸足體驗" },
      "contact-time": { value: "afternoon", label: "下午" },
    })).toBe("姓名：黃彥陸 · 服務項目：蒸足體驗 · 方便聯絡時間：下午");
  });

  it("falls back to an option value and keeps custom answer keys visible", () => {
    expect(digitalButlerAnswerSummary({
      "service-item": { value: "蒸足體驗" },
      note: "第一次體驗",
    })).toBe("服務項目：蒸足體驗 · note：第一次體驗");
  });

  it("returns a placeholder when there are no displayable answers", () => {
    expect(digitalButlerAnswerSummary(null)).toBe("—");
    expect(digitalButlerAnswerSummary({ skipped: null })).toBe("—");
  });

  it("describes a human-support handoff without exposing technical fields", () => {
    expect(digitalButlerAnswerSummary({
      provider: "LINE",
      requestType: "HUMAN_SUPPORT",
    }, { isHumanSupportHandoff: true })).toBe("顧客希望轉接真人客服");
    expect(digitalButlerAnswerSummary({
      provider: "MESSENGER",
      requestType: { value: "HUMAN_SUPPORT", label: "轉接客服" },
    }, { isHumanSupportHandoff: true })).toBe("顧客希望轉接真人客服");
  });

  it("keeps collected answers when a normal lead selected the human-support option", () => {
    expect(digitalButlerAnswerSummary({
      name: "黃彥陸",
      requestType: { value: "HUMAN_SUPPORT", label: "真人客服" },
      "contact-time": { value: "afternoon", label: "下午" },
    })).toBe("姓名：黃彥陸 · requestType：真人客服 · 方便聯絡時間：下午");
  });
});
