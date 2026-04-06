/**
 * LINE Messaging API 串接
 *
 * 使用 LINE Official Account + Messaging API
 * 環境變數：LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET
 */

import crypto from "crypto";

const LINE_API_BASE = "https://api.line.me/v2/bot";

function getChannelAccessToken(): string {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  return token;
}

function getChannelSecret(): string {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) throw new Error("LINE_CHANNEL_SECRET is not set");
  return secret;
}

/** 驗證 LINE webhook signature */
export function verifyLineSignature(body: string, signature: string): boolean {
  const secret = getChannelSecret();
  const hash = crypto
    .createHmac("SHA256", secret)
    .update(body)
    .digest("base64");
  return hash === signature;
}

/** Push message to a specific user */
export async function pushMessage(
  lineUserId: string,
  messages: LineMessage[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = getChannelAccessToken();
    const res = await fetch(`${LINE_API_BASE}/message/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        error: `LINE API ${res.status}: ${JSON.stringify(err)}`,
      };
    }

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

/** Reply to a webhook event */
export async function replyMessage(
  replyToken: string,
  messages: LineMessage[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = getChannelAccessToken();
    const res = await fetch(`${LINE_API_BASE}/message/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replyToken,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        error: `LINE API ${res.status}: ${JSON.stringify(err)}`,
      };
    }

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

/** Get user profile */
export async function getUserProfile(
  lineUserId: string
): Promise<{ displayName: string; pictureUrl?: string } | null> {
  try {
    const token = getChannelAccessToken();
    const res = await fetch(`${LINE_API_BASE}/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ============================================================
// Types
// ============================================================

export interface LineTextMessage {
  type: "text";
  text: string;
}

export type LineMessage = LineTextMessage;

// ============================================================
// Template rendering
// ============================================================

export interface TemplateVariables {
  customerName: string;
  bookingDate: string;
  bookingTime: string;
  shopName: string;
  staffName: string;
  bookingLink: string;
}

/** 將模板中的 {{variable}} 替換為實際值 */
export function renderTemplate(
  template: string,
  vars: TemplateVariables
): string {
  return template
    .replace(/\{\{customerName\}\}/g, vars.customerName)
    .replace(/\{\{bookingDate\}\}/g, vars.bookingDate)
    .replace(/\{\{bookingTime\}\}/g, vars.bookingTime)
    .replace(/\{\{shopName\}\}/g, vars.shopName)
    .replace(/\{\{staffName\}\}/g, vars.staffName)
    .replace(/\{\{bookingLink\}\}/g, vars.bookingLink);
}
