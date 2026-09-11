import { describe, expect, it } from "vitest";
import { classifyDigitalButlerGlobalCommand } from "@/lib/digital-butler-global-command";

describe("classifyDigitalButlerGlobalCommand", () => {
  it.each([
    ["停", "CANCEL"],
    ["停止", "CANCEL"],
    ["取消！", "CANCEL"],
    ["結束", "CANCEL"],
    ["退出", "CANCEL"],
    ["不用了", "CANCEL"],
    ["轉接客服", "HANDOFF"],
    ["真人客服", "HANDOFF"],
    ["轉真人", "HANDOFF"],
    ["找客服", "HANDOFF"],
    ["聯絡真人", "HANDOFF"],
    ["人工客服", "HANDOFF"],
    ["回主選單", "MAIN_MENU"],
  ] as const)("classifies %s as %s", (text, expected) => {
    expect(classifyDigitalButlerGlobalCommand(text)).toBe(expected);
  });

  it.each([
    "0912345678",
    "我想了解蒸足",
    "我想取消明天的預約",
    "請問可以轉接客服嗎",
    "停止流汗後要注意什麼",
    "重新開始",
    "",
  ])("does not over-match normal conversation text: %s", (text) => {
    expect(classifyDigitalButlerGlobalCommand(text)).toBeNull();
  });
});
