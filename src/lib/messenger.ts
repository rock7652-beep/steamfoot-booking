import { createHmac, timingSafeEqual } from "node:crypto";
import type { DigitalButlerOutboundMessageIntent } from "@/server/services/digital-butler-channel";

const GRAPH_API_VERSION = process.env.MESSENGER_GRAPH_API_VERSION?.trim() || "v23.0";

export type MessengerMessage = {
  text: string;
  quick_replies?: Array<{
    content_type: "text";
    title: string;
    payload: string;
  }>;
};

export function verifyMessengerSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const receivedHex = signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) return false;

  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"), "hex");
  const received = Buffer.from(receivedHex, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function digitalButlerIntentsToMessengerMessages(
  intents: DigitalButlerOutboundMessageIntent[],
): MessengerMessage[] {
  return intents.map((intent) => {
    if (intent.type === "card") {
      return { text: intent.altText };
    }

    return {
      text: intent.text,
      ...(intent.choices?.length
        ? {
            quick_replies: intent.choices.slice(0, 13).map((choice) => ({
              content_type: "text" as const,
              title: choice.label.slice(0, 20),
              payload: choice.value,
            })),
          }
        : {}),
    };
  });
}

export async function sendMessengerMessages(input: {
  pageId: string;
  pageAccessToken: string;
  recipientId: string;
  messages: MessengerMessage[];
}): Promise<{ success: boolean; error?: string }> {
  for (const message of input.messages) {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(input.pageId)}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.pageAccessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: input.recipientId },
          messaging_type: "RESPONSE",
          message,
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error("[Messenger Send API] delivery failed", {
        pageId: input.pageId,
        status: response.status,
        bodyLength: errorBody.length,
      });
      return { success: false, error: `Messenger Send API returned ${response.status}` };
    }
  }

  return { success: true };
}
