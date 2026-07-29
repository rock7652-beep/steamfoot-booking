import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  digitalButlerIntentsToMessengerMessages,
  verifyMessengerSignature,
} from "@/lib/messenger";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Messenger Digital Butler foundation", () => {
  it("verifies Meta SHA-256 signatures with the raw request body", () => {
    const body = JSON.stringify({ object: "page", entry: [] });
    const secret = "test-app-secret";
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

    expect(verifyMessengerSignature(body, signature, secret)).toBe(true);
    expect(verifyMessengerSignature(`${body} `, signature, secret)).toBe(false);
    expect(verifyMessengerSignature(body, "sha256=invalid", secret)).toBe(false);
  });

  it("uses button templates for compact choices, with visible text fallback and stable postbacks", () => {
    const messages = digitalButlerIntentsToMessengerMessages([
      {
        type: "text",
        text: "如果還不確定日期，也可以選擇由店家聯絡您：",
        choices: [
          { label: "請店家聯絡我", value: "CONTACT_STORE" },
          { label: "回到主選單", value: "MAIN_MENU" },
        ],
      },
      {
        type: "text",
        text: "\u200B",
        choices: [
          { label: "我想預約體驗", value: "BOOKING" },
          { label: "蒸足如何進行", value: "HOW_IT_WORKS" },
          { label: "適合哪些人", value: "WHO_IS_IT_FOR" },
          { label: "地址與營業時間", value: "LOCATION" },
          { label: "轉接客服", value: "CONTACT_STAFF" },
          ...Array.from({ length: 10 }, (_, index) => ({
            label: `其他選項 ${index + 1}`,
            value: `EXTRA_OPTION_${index + 1}`,
          })),
        ],
      },
      { type: "card", altText: "蒸足介紹", payload: { type: "bubble" } },
    ]);

    expect(messages[0]?.text).toContain("首次蒸足體驗優惠價 NT$499");
    expect(messages[0]?.text).toContain("點擊下方連結，立即選擇日期與時段");
    expect(messages[0]?.text).toContain("https://www.steamfoot.com/pricing/experience/zhubei/book#booking-form");
    expect(messages[1].attachment?.payload).toMatchObject({
      template_type: "button",
      text: "如果還不確定時間，也可以選擇由店家聯絡您：",
      buttons: [
        { type: "postback", title: "請店家聯絡我", payload: "CONTACT_STORE" },
        { type: "postback", title: "回到主選單", payload: "MAIN_MENU" },
      ],
    });
    expect(messages[2].text).toContain("我想預約體驗");
    expect(messages[2].quick_replies).toHaveLength(13);
    expect(messages[2].quick_replies?.[0]).toMatchObject({
      content_type: "text",
      title: "我想預約體驗",
      payload: "BOOKING",
    });
    expect(messages[3]).toEqual({ text: "蒸足介紹" });
    const serialized = JSON.stringify(messages);
    expect(serialized).not.toContain("quickReply");
    expect(serialized).not.toContain('"action"');
    for (const message of messages) {
      for (const quickReply of message.quick_replies ?? []) {
        expect(quickReply.title.trim()).not.toBe("");
        expect(quickReply.payload.trim()).not.toBe("");
      }
    }
  });

  it("renders a confirmation intent with choices as one Messenger button message", () => {
    const messages = digitalButlerIntentsToMessengerMessages([{
      type: "text",
      text: "請確認您的資料：\n姓名：王小美\n手機：0912345678\n需求：預約體驗\n資料正確後請選擇確認送出。",
      singleMessageChoices: true,
      choices: [
        { label: "確認送出", value: "CONFIRM" },
        { label: "重新填寫", value: "RESTART" },
      ],
    }]);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.attachment?.payload).toMatchObject({
      text: expect.stringContaining("姓名：王小美"),
      buttons: [
        { type: "postback", title: "確認送出", payload: "CONFIRM" },
        { type: "postback", title: "重新填寫", payload: "RESTART" },
      ],
    });
  });

  it("renders a completion URL as a Messenger web URL button", () => {
    const messages = digitalButlerIntentsToMessengerMessages([{
      type: "text",
      text: "已收到您的資料，店家將儘快與您聯絡。\nhttps://www.steamfoot.com/pricing/experience/zhubei/book#booking-form",
      urlButton: {
        label: "立即預約體驗",
        url: "https://www.steamfoot.com/pricing/experience/zhubei/book#booking-form",
      },
    }]);

    expect(messages).toEqual([{
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: expect.stringContaining("https://www.steamfoot.com/pricing/experience/zhubei/book#booking-form"),
          buttons: [{
            type: "web_url",
            title: "立即預約體驗",
            url: "https://www.steamfoot.com/pricing/experience/zhubei/book#booking-form",
          }],
        },
      },
    }]);
  });

  it("connects verified Page events to the channel-neutral runtime", () => {
    const route = source("src/app/api/messenger/webhook/route.ts");
    const config = source("src/lib/messenger-config.ts");
    const proxy = source("src/proxy.ts");

    expect(route).toContain('url.searchParams.get("hub.verify_token")');
    expect(route).toContain('request.headers.get("x-hub-signature-256")');
    expect(route).toContain('provider: "MESSENGER"');
    expect(route).toContain("event.postback?.payload?.trim() || message?.quick_reply?.payload?.trim() || message?.text?.trim()");
    expect(route).toContain("const messageId = event.postback?.mid || message?.mid");
    expect(route).toContain("message?.is_echo");
    expect(route).toContain("resolveMessengerStoreByPageId(entry.id)");
    expect(route).toContain("runtime.deliverReplyIfActive");
    expect(config).toContain("MESSENGER_PAGE_ID_${suffix}");
    expect(config).toContain("MESSENGER_PAGE_ACCESS_TOKEN_${suffix}");
    expect(config).not.toContain("DEFAULT_STORE_ID");
    expect(proxy).toContain('pathname === "/book/zhubei"');
    expect(proxy).toContain('"/pricing/experience/zhubei/book#booking-form"');
  });

  it("uses the Send API without exposing credentials in logs", () => {
    const messenger = source("src/lib/messenger.ts");

    expect(messenger).toContain('authorization: `Bearer ${input.pageAccessToken}`');
    expect(messenger).toContain('messaging_type: "RESPONSE"');
    expect(messenger).not.toContain("console.log(input.pageAccessToken)");
  });
});
