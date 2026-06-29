/**
 * LINE Messaging API 串接
 *
 * 使用 LINE Official Account + Messaging API
 * 環境變數：LINE_<STORE>_CHANNEL_ACCESS_TOKEN, LINE_<STORE>_CHANNEL_SECRET
 */

import crypto from "crypto";
import {
  getLineAccessTokenForStore,
  getLineSecretForStore,
  LINE_SECRET_NOT_CONFIGURED_ERROR,
  LINE_TOKEN_NOT_CONFIGURED_ERROR,
} from "@/lib/line-config";

const LINE_API_BASE = "https://api.line.me/v2/bot";

/** 驗證 LINE webhook signature */
export function verifyLineSignature(
  storeId: string,
  body: string,
  signature: string
): boolean {
  const secret = getLineSecretForStore(storeId);
  if (!secret) return false;
  const hash = crypto
    .createHmac("SHA256", secret)
    .update(body)
    .digest("base64");
  return hash === signature;
}

/** Push message to a specific user */
export async function pushMessage(
  storeId: string,
  lineUserId: string,
  messages: LineMessage[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = getLineAccessTokenForStore(storeId);
    if (!token) {
      return { success: false, error: LINE_TOKEN_NOT_CONFIGURED_ERROR };
    }
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
  storeId: string,
  replyToken: string,
  messages: LineMessage[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = getLineAccessTokenForStore(storeId);
    if (!token) {
      return { success: false, error: LINE_TOKEN_NOT_CONFIGURED_ERROR };
    }
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
  storeId: string,
  lineUserId: string
): Promise<{ displayName: string; pictureUrl?: string; error?: string } | null> {
  try {
    const token = getLineAccessTokenForStore(storeId);
    if (!token) {
      return { displayName: "", error: LINE_TOKEN_NOT_CONFIGURED_ERROR };
    }
    const res = await fetch(`${LINE_API_BASE}/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export { LINE_SECRET_NOT_CONFIGURED_ERROR, LINE_TOKEN_NOT_CONFIGURED_ERROR };

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
