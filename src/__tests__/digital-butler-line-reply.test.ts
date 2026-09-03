import { describe, expect, it } from "vitest";
import type { LineMessage } from "@/lib/line";
import {
  addDigitalButlerEscapeQuickReplies,
  FALLBACK_QUICK_REPLY_CARRIER,
  isVisibleLineText,
  sanitizeDigitalButlerReplyMessages,
} from "@/server/services/digital-butler-line-reply";

const quickReply = {
  items: [{
    type: "action" as const,
    action: { type: "message" as const, label: "我想預約體驗", text: "我想預約體驗" },
  }],
};

describe("Digital Butler LINE reply sanitation", () => {
  it("adds visible human-support and exit actions while waiting for customer input", () => {
    expect(addDigitalButlerEscapeQuickReplies([
      { type: "text", text: "請選擇您想了解的內容：", quickReply },
    ], "WAITING_INPUT")).toEqual([
      {
        type: "text",
        text: "請選擇您想了解的內容：",
        quickReply: { items: [
          ...quickReply.items,
          { type: "action", action: { type: "message", label: "聯絡真人", text: "真人客服" } },
          { type: "action", action: { type: "message", label: "結束數位管家", text: "結束" } },
        ] },
      },
    ]);
  });

  it("does not add escape actions after the flow has ended", () => {
    const messages: LineMessage[] = [{ type: "text", text: "已結束" }];
    expect(addDigitalButlerEscapeQuickReplies(messages, "CANCELLED_BY_USER")).toBe(messages);
  });

  it("moves a zero-width quick reply carrier onto the prior visible opening message", () => {
    const messages: LineMessage[] = [
      { type: "text", text: "歡迎來到暖暖蒸足竹北店！" },
      { type: "text", text: "\u200B", quickReply },
    ];

    expect(sanitizeDigitalButlerReplyMessages(messages)).toEqual([
      { type: "text", text: "歡迎來到暖暖蒸足竹北店！", quickReply },
    ]);
  });

  it("uses a visible fallback carrier when an invisible quick reply message has no prior text", () => {
    expect(sanitizeDigitalButlerReplyMessages([
      { type: "flex", altText: "首次體驗", contents: {} },
      { type: "text", text: "\u200B", quickReply },
    ])).toEqual([
      { type: "flex", altText: "首次體驗", contents: {} },
      { type: "text", text: FALLBACK_QUICK_REPLY_CARRIER, quickReply },
    ]);
  });

  it("filters empty, whitespace-only, and invisible-only text messages", () => {
    expect(sanitizeDigitalButlerReplyMessages([
      { type: "text", text: "" },
      { type: "text", text: " \n\t " },
      { type: "text", text: "\u200B\u2060\uFEFF" },
      { type: "text", text: "有效訊息" },
    ])).toEqual([{ type: "text", text: "有效訊息" }]);
    expect(isVisibleLineText("\u200B")).toBe(false);
    expect(isVisibleLineText("有效訊息")).toBe(true);
  });

  it("preserves valid text and its quick replies", () => {
    const messages: LineMessage[] = [{ type: "text", text: "請選擇您想了解的內容：", quickReply }];
    expect(sanitizeDigitalButlerReplyMessages(messages)).toEqual(messages);
  });
});
