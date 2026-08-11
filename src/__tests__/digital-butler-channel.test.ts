import { describe, expect, it } from "vitest";
import { digitalButlerIntentsToLineMessages } from "@/server/services/digital-butler-channel";

describe("Digital Butler LINE channel adapter", () => {
  it("renders neutral choices as LINE quick replies", () => {
    expect(digitalButlerIntentsToLineMessages([{
      type: "text",
      text: "請選擇：",
      choices: [{ label: "預約體驗", value: "booking" }],
    }])).toEqual([{
      type: "text",
      text: "請選擇：",
      quickReply: {
        items: [{
          type: "action",
          action: { type: "message", label: "預約體驗", text: "booking" },
        }],
      },
    }]);
  });

  it("keeps confirmation choices as LINE quick replies", () => {
    expect(digitalButlerIntentsToLineMessages([{
      type: "text",
      text: "請確認您的資料：",
      singleMessageChoices: true,
      choices: [{ label: "確認送出", value: "CONFIRM" }],
    }])).toMatchObject([{
      type: "text",
      text: "請確認您的資料：",
      quickReply: {
        items: [{ action: { label: "確認送出", text: "CONFIRM" } }],
      },
    }]);
  });

  it("renders a neutral card payload as a LINE Flex message", () => {
    const payload = { type: "bubble", body: { type: "box", layout: "vertical", contents: [] } };
    expect(digitalButlerIntentsToLineMessages([{
      type: "card",
      altText: "數位管家訊息",
      payload,
    }])).toEqual([{
      type: "flex",
      altText: "數位管家訊息",
      contents: payload,
    }]);
  });

  it("renders a signed URL button as a visible LINE link", () => {
    expect(digitalButlerIntentsToLineMessages([{
      type: "text",
      text: "請使用專屬連結預約。",
      urlButton: { label: "立即預約", url: "https://example.test/book?entry=signed" },
    }])).toEqual([{
      type: "text",
      text: "請使用專屬連結預約。\n\n立即預約：https://example.test/book?entry=signed",
    }]);
  });
});
