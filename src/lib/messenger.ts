import { createHmac, timingSafeEqual } from "node:crypto";
import { ZHUBEI_EXPERIENCE_BOOKING_URL } from "@/lib/booking-links";
import type { DigitalButlerOutboundMessageIntent } from "@/server/services/digital-butler-channel";

const GRAPH_API_VERSION = process.env.MESSENGER_GRAPH_API_VERSION?.trim() || "v23.0";
const TRIAL_BOOKING_PROMPT =
  `首次蒸足體驗優惠價 NT$499（原價 NT$799）\n點擊下方連結，立即選擇日期與時段：\n${ZHUBEI_EXPERIENCE_BOOKING_URL}`;
const TRIAL_BOOKING_ASSISTANCE_PROMPT =
  "如果還不確定時間，也可以選擇由店家聯絡您：";

type MessengerButton =
  | { type: "postback"; title: string; payload: string }
  | { type: "web_url"; title: string; url: string };

export type MessengerMessage = {
  text?: string;
  quick_replies?: Array<{
    content_type: "text";
    title: string;
    payload: string;
  }>;
  attachment?: {
    type: "template";
    payload: {
      template_type: "button";
      text: string;
      buttons: MessengerButton[];
    };
  };
};

type MessengerChoice = { title: string; payload: string };

function messengerChoices(choices: Array<{ label: string; value: string }> | undefined): MessengerChoice[] {
  return (choices ?? []).flatMap((choice) => {
    const title = choice.label.trim().slice(0, 20);
    const payload = choice.value.trim();
    return title && payload ? [{ title, payload }] : [];
  }).slice(0, 13);
}

function visibleChoiceFallback(text: string, choices: MessengerChoice[]): string {
  const visibleText = text.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if (visibleText) return visibleText;
  return `請選擇：${choices.map((choice) => choice.title).join("、")}`;
}

function trialBookingButtons(choices: MessengerChoice[]): MessengerButton[] | null {
  const contactStore = choices.find((choice) => choice.payload === "CONTACT_STORE");
  const mainMenu = choices.find((choice) => choice.payload === "MAIN_MENU");
  if (!contactStore || !mainMenu) return null;

  return [
    { type: "postback", title: contactStore.title, payload: contactStore.payload },
    { type: "postback", title: mainMenu.title, payload: mainMenu.payload },
  ];
}

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
  return intents.flatMap((intent): MessengerMessage[] => {
    if (intent.type === "card") {
      return [{ text: intent.altText }];
    }

    const choices = messengerChoices(intent.choices);
    const bookingButtons = trialBookingButtons(choices);
    const text = bookingButtons
      ? TRIAL_BOOKING_PROMPT
      : visibleChoiceFallback(intent.text, choices);
    const urlButton = intent.urlButton?.label.trim() && intent.urlButton.url.trim()
      ? {
          type: "web_url" as const,
          title: intent.urlButton.label.trim().slice(0, 20),
          url: intent.urlButton.url.trim(),
        }
      : null;
    if (urlButton) {
      return [{
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: text.slice(0, 640),
            buttons: [urlButton],
          },
        },
      }];
    }
    if (choices.length > 0 && choices.length <= 3) {
      const buttonTemplate: MessengerMessage = {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: (bookingButtons ? TRIAL_BOOKING_ASSISTANCE_PROMPT : text).slice(0, 640),
              buttons: bookingButtons
                ?? choices.map((choice) => ({ type: "postback", title: choice.title, payload: choice.payload })),
            },
          },
        };
      return intent.singleMessageChoices ? [buttonTemplate] : [{ text }, buttonTemplate];
    }

    return [{
      text,
      ...(choices.length
        ? {
            quick_replies: choices.map((choice) => ({
              content_type: "text" as const,
              title: choice.title,
              payload: choice.payload,
            })),
          }
        : {}),
    }];
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
