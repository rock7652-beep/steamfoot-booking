import type { LineMessage, LineTextMessage } from "@/lib/line";

const INVISIBLE_LINE_TEXT = /[\s\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u2800\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/gu;
const FALLBACK_QUICK_REPLY_CARRIER = "請選擇：";
const ACTIVE_REPLY_OUTCOMES = new Set(["WAITING_INPUT", "VALIDATION_FAILED", "INFORMATION_ANSWERED"]);
const ESCAPE_QUICK_REPLIES: NonNullable<LineTextMessage["quickReply"]>["items"] = [
  { type: "action", action: { type: "message", label: "聯絡真人", text: "真人客服" } },
  { type: "action", action: { type: "message", label: "結束數位管家", text: "結束" } },
];

export type DigitalButlerReplyDiagnostics = {
  storeId: string;
  outcome: string;
  messageCount: number;
  hasQuickReply: boolean;
};

function isVisibleLineText(text: string): boolean {
  return text.replace(INVISIBLE_LINE_TEXT, "").length > 0;
}

function mergeQuickReplies(
  current: LineTextMessage["quickReply"],
  next: LineTextMessage["quickReply"],
): LineTextMessage["quickReply"] {
  if (!current) return next;
  if (!next) return current;
  return { items: [...current.items, ...next.items].slice(0, 13) };
}

/**
 * LINE rejects an empty or invisible text message even when it carries quick
 * replies. Keep the quick replies, but attach them to a visible text message
 * instead of sending an invalid carrier.
 */
export function sanitizeDigitalButlerReplyMessages(messages: LineMessage[]): LineMessage[] {
  const sanitized: LineMessage[] = [];
  let pendingQuickReply: LineTextMessage["quickReply"];

  const attachToPreviousText = (quickReply: LineTextMessage["quickReply"]): boolean => {
    if (!quickReply?.items.length) return true;
    for (let index = sanitized.length - 1; index >= 0; index -= 1) {
      const message = sanitized[index];
      if (message.type !== "text") continue;
      sanitized[index] = {
        ...message,
        quickReply: mergeQuickReplies(message.quickReply, quickReply),
      };
      return true;
    }
    return false;
  };

  for (const message of messages) {
    if (message.type !== "text") {
      sanitized.push(message);
      continue;
    }

    if (!isVisibleLineText(message.text)) {
      if (message.quickReply?.items.length) {
        if (!attachToPreviousText(message.quickReply)) {
          pendingQuickReply = mergeQuickReplies(pendingQuickReply, message.quickReply);
        }
      }
      continue;
    }

    sanitized.push({
      ...message,
      quickReply: mergeQuickReplies(message.quickReply, pendingQuickReply),
    });
    pendingQuickReply = undefined;
  }

  if (pendingQuickReply?.items.length) {
    sanitized.push({ type: "text", text: FALLBACK_QUICK_REPLY_CARRIER, quickReply: pendingQuickReply });
  }

  return sanitized;
}

/** Keep a visible escape hatch on every LINE reply that is waiting for input. */
export function addDigitalButlerEscapeQuickReplies(
  messages: LineMessage[],
  outcome: string,
): LineMessage[] {
  if (!ACTIVE_REPLY_OUTCOMES.has(outcome)) return messages;

  const targetIndex = messages.findLastIndex((message) => message.type === "text");
  if (targetIndex < 0) {
    return [
      ...messages,
      { type: "text", text: FALLBACK_QUICK_REPLY_CARRIER, quickReply: { items: ESCAPE_QUICK_REPLIES } },
    ];
  }

  return messages.map((message, index) => {
    if (index !== targetIndex || message.type !== "text") return message;
    const existing = message.quickReply?.items ?? [];
    return {
      ...message,
      quickReply: { items: [...existing.slice(0, 11), ...ESCAPE_QUICK_REPLIES] },
    };
  });
}

export function digitalButlerReplyDiagnostics(
  storeId: string,
  outcome: string,
  messages: LineMessage[],
): DigitalButlerReplyDiagnostics {
  return {
    storeId,
    outcome,
    messageCount: messages.length,
    hasQuickReply: messages.some((message) => message.type === "text" && Boolean(message.quickReply?.items.length)),
  };
}

export { FALLBACK_QUICK_REPLY_CARRIER, isVisibleLineText };
