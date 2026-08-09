import { DigitalButlerRuntime } from "@/server/services/digital-butler-runtime";
import {
  getMessengerAppSecret,
  getMessengerVerifyToken,
  resolveMessengerStoreByPageId,
} from "@/lib/messenger-config";
import {
  digitalButlerIntentsToMessengerMessages,
  sendMessengerMessages,
  verifyMessengerSignature,
} from "@/lib/messenger";
import { createTrialBookingChatLink } from "@/server/services/trial-booking-chat-link";
import { ZHUBEI_EXPERIENCE_BOOKING_URL } from "@/lib/booking-links";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = getMessengerVerifyToken();

  if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const appSecret = getMessengerAppSecret();
  const signature = request.headers.get("x-hub-signature-256");

  if (!appSecret) {
    console.error("[Messenger Webhook] MESSENGER_APP_SECRET not configured");
    return new Response("Configuration error", { status: 500 });
  }

  if (!verifyMessengerSignature(rawBody, signature, appSecret)) {
    console.warn("[Messenger Webhook] Invalid signature", { hasSignature: Boolean(signature) });
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody) as MessengerWebhookPayload;
    if (payload.object !== "page") return new Response("EVENT_RECEIVED", { status: 200 });

    for (const entry of payload.entry ?? []) {
      const store = await resolveMessengerStoreByPageId(entry.id);
      if (!store) {
        console.warn("[Messenger Webhook] Unknown or unconfigured page", { pageId: entry.id });
        continue;
      }

      for (const event of entry.messaging ?? []) {
        try {
          await handleMessagingEvent(event, entry.id, store);
        } catch (error) {
          console.error("[Messenger Webhook] Event handler failed", {
            pageId: entry.id,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    }
  } catch (error) {
    console.error("[Messenger Webhook] Invalid payload", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}

async function handleMessagingEvent(
  event: MessengerMessagingEvent,
  pageId: string,
  store: { id: string; slug: string; accessToken: string },
): Promise<void> {
  const message = event.message;
  const messageId = event.postback?.mid || message?.mid;
  const senderId = event.sender?.id;
  if (message?.is_echo || !senderId || !messageId) return;

  const text = event.postback?.payload?.trim() || message?.quick_reply?.payload?.trim() || message?.text?.trim();
  if (!text) return;

  const runtime = new DigitalButlerRuntime();
  const result = await runtime.handleText({
    storeId: store.id,
    provider: "MESSENGER",
    channelAccountId: pageId,
    senderId,
    messageId,
    webhookEventId: messageId,
    occurredAt: new Date(event.timestamp || Date.now()),
    text,
  });

  if (!result.handled || result.messages.length === 0) return;

  // A web_url is the only public bridge from the existing Messenger flow.
  // Replace the legacy shared URL with a per-chat opaque link before it leaves
  // this signed webhook; failures deliberately retain the ordinary shared form.
  const messages = await Promise.all(result.messages.map(async (intent) => {
    if (intent.type !== "text" || intent.urlButton?.url !== ZHUBEI_EXPERIENCE_BOOKING_URL) return intent;
    try {
      const link = await createTrialBookingChatLink({ storeId: store.id, channel: "MESSENGER", chatIdentity: senderId });
      return { ...intent, urlButton: { ...intent.urlButton, url: link.url } };
    } catch {
      console.error("[Messenger Webhook] booking link issue failed", { storeId: store.id });
      return intent;
    }
  }));

  const deliver = async (): Promise<void> => {
    const delivery = await sendMessengerMessages({
      pageId,
      pageAccessToken: store.accessToken,
      recipientId: senderId,
      messages: digitalButlerIntentsToMessengerMessages(messages),
    });
    if (delivery.success) return;
    console.error("[Messenger Webhook] Reply failed", {
      pageId,
      storeId: store.id,
      error: delivery.error,
    });
    throw new Error(delivery.error ?? "Messenger reply delivery failed");
  };

  if (result.replyGuard?.requiresActiveConversation) {
    await runtime.deliverReplyIfActive(store.id, result.replyGuard.conversationId, deliver);
    return;
  }
  await deliver();
}

type MessengerWebhookPayload = {
  object?: string;
  entry?: Array<{
    id: string;
    time?: number;
    messaging?: MessengerMessagingEvent[];
  }>;
};

type MessengerMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    quick_reply?: { payload?: string };
  };
  postback?: { mid?: string; payload?: string };
};
