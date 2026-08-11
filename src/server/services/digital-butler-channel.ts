import type { LineMessage } from "@/lib/line";

export const DIGITAL_BUTLER_PROVIDERS = ["LINE", "MESSENGER", "INSTAGRAM"] as const;

export type DigitalButlerProvider = (typeof DIGITAL_BUTLER_PROVIDERS)[number];

export type DigitalButlerInboundTextMessage = {
  storeId: string;
  provider: DigitalButlerProvider;
  channelAccountId: string;
  senderId: string;
  messageId: string;
  occurredAt: Date;
  text: string;
  webhookEventId?: string;
};

export type DigitalButlerOutboundMessageIntent =
  | {
      type: "text";
      text: string;
      choices?: Array<{ label: string; value: string }>;
      singleMessageChoices?: boolean;
      urlButton?: { label: string; url: string };
    }
  | {
      type: "card";
      altText: string;
      payload: Record<string, unknown>;
    };

/** LINE-specific rendering belongs at the channel boundary. */
export function digitalButlerIntentsToLineMessages(
  intents: DigitalButlerOutboundMessageIntent[],
): LineMessage[] {
  return intents.map((intent): LineMessage => {
    if (intent.type === "card") {
      return { type: "flex", altText: intent.altText, contents: intent.payload };
    }
    return {
      type: "text",
      text: intent.urlButton
        ? `${intent.text}\n\n${intent.urlButton.label}：${intent.urlButton.url}`
        : intent.text,
      ...(intent.choices?.length
        ? {
            quickReply: {
              items: intent.choices.slice(0, 13).map((choice) => ({
                type: "action" as const,
                action: {
                  type: "message" as const,
                  label: choice.label,
                  text: choice.value,
                },
              })),
            },
          }
        : {}),
    };
  });
}
