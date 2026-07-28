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

  it("renders text choices as Messenger quick replies and cards as safe text", () => {
    const messages = digitalButlerIntentsToMessengerMessages([
      {
        type: "text",
        text: "請選擇",
        choices: Array.from({ length: 15 }, (_, index) => ({
          label: `選項 ${index + 1}`,
          value: `OPTION_${index + 1}`,
        })),
      },
      { type: "card", altText: "蒸足介紹", payload: { type: "bubble" } },
    ]);

    expect(messages[0].quick_replies).toHaveLength(13);
    expect(messages[0].quick_replies?.[0]).toMatchObject({
      content_type: "text",
      title: "選項 1",
      payload: "OPTION_1",
    });
    expect(messages[1]).toEqual({ text: "蒸足介紹" });
  });

  it("connects verified Page events to the channel-neutral runtime", () => {
    const route = source("src/app/api/messenger/webhook/route.ts");
    const config = source("src/lib/messenger-config.ts");

    expect(route).toContain('url.searchParams.get("hub.verify_token")');
    expect(route).toContain('request.headers.get("x-hub-signature-256")');
    expect(route).toContain('provider: "MESSENGER"');
    expect(route).toContain("message.quick_reply?.payload?.trim() || message.text?.trim()");
    expect(route).toContain("message.is_echo");
    expect(route).toContain("resolveMessengerStoreByPageId(entry.id)");
    expect(config).toContain("MESSENGER_PAGE_ID_${suffix}");
    expect(config).toContain("MESSENGER_PAGE_ACCESS_TOKEN_${suffix}");
    expect(config).not.toContain("DEFAULT_STORE_ID");
  });

  it("uses the Send API without logging access tokens or sender ids", () => {
    const messenger = source("src/lib/messenger.ts");
    const route = source("src/app/api/messenger/webhook/route.ts");

    expect(messenger).toContain('authorization: `Bearer ${input.pageAccessToken}`');
    expect(messenger).toContain('messaging_type: "RESPONSE"');
    expect(messenger).not.toContain("console.log(input.pageAccessToken)");
    expect(route).not.toContain("senderId: event.sender.id,");
  });
});
