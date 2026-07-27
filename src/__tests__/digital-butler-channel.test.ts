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
});
