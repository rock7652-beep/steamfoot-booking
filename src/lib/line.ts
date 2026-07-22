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
  getSteamButlerLineAccessToken,
  getSteamButlerLineSecret,
  LINE_SECRET_NOT_CONFIGURED_ERROR,
  LINE_TOKEN_NOT_CONFIGURED_ERROR,
} from "@/lib/line-config";

const LINE_API_BASE = "https://api.line.me/v2/bot";
const LINE_BOT_INFO_TIMEOUT_MS = 8_000;

export type LineBotInfo = {
  displayName: string;
  basicId: string;
  userId: string;
};

export type LineBotInfoResult =
  | { ok: true; data: LineBotInfo }
  | { ok: false; code: "TOKEN_NOT_CONFIGURED" | "TOKEN_UNAUTHORIZED" | "UPSTREAM_ERROR" | "TIMEOUT" | "INVALID_RESPONSE" };

export type LineReplyResult =
  | { success: true }
  | {
      success: false;
      error: string;
      httpStatus: number | null;
      errorType: "token_not_configured" | "line_api_rejected" | "network_error";
    };

/**
 * Read the Messaging API Bot Info for a store without logging or exposing the
 * access token. Callers must keep `userId` server-side unless they have an
 * explicit reason to disclose it.
 */
export async function getLineBotInfo(storeId: string): Promise<LineBotInfoResult> {
  const token = getLineAccessTokenForStore(storeId);
  if (!token) return { ok: false, code: "TOKEN_NOT_CONFIGURED" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LINE_BOT_INFO_TIMEOUT_MS);
  try {
    const response = await fetch(`${LINE_API_BASE}/info`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, code: "TOKEN_UNAUTHORIZED" };
    }
    if (!response.ok) return { ok: false, code: "UPSTREAM_ERROR" };

    const body = await response.json().catch(() => null) as Partial<LineBotInfo> | null;
    if (!body || typeof body.displayName !== "string" || typeof body.basicId !== "string" || typeof body.userId !== "string") {
      return { ok: false, code: "INVALID_RESPONSE" };
    }
    return { ok: true, data: { displayName: body.displayName, basicId: body.basicId, userId: body.userId } };
  } catch (error) {
    return { ok: false, code: error instanceof DOMException && error.name === "AbortError" ? "TIMEOUT" : "UPSTREAM_ERROR" };
  } finally {
    clearTimeout(timeout);
  }
}

/** 驗證 LINE webhook signature */
export function verifyLineSignature(
  storeId: string,
  body: string,
  signature: string
): boolean {
  const secret = getLineSecretForStore(storeId);
  if (!secret) return false;
  return verifyLineSignatureWithSecret(body, signature, secret);
}

export function verifySteamButlerLineSignature(body: string, signature: string): boolean {
  const secret = getSteamButlerLineSecret();
  if (!secret) return false;
  return verifyLineSignatureWithSecret(body, signature, secret);
}

function verifyLineSignatureWithSecret(body: string, signature: string, secret: string): boolean {
  const hash = crypto
    .createHmac("SHA256", secret)
    .update(body)
    .digest("base64");
  const expected = Buffer.from(hash, "utf8");
  const received = Buffer.from(signature, "utf8");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
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
): Promise<LineReplyResult> {
  return replyMessageWithAccessToken(getLineAccessTokenForStore(storeId), replyToken, messages);
}

export async function replySteamButlerMessage(
  replyToken: string,
  messages: LineMessage[]
): Promise<LineReplyResult> {
  return replyMessageWithAccessToken(getSteamButlerLineAccessToken(), replyToken, messages);
}

async function replyMessageWithAccessToken(
  token: string | null,
  replyToken: string,
  messages: LineMessage[]
): Promise<LineReplyResult> {
  try {
    if (!token) {
      return {
        success: false,
        error: LINE_TOKEN_NOT_CONFIGURED_ERROR,
        httpStatus: null,
        errorType: "token_not_configured",
      };
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
      return {
        success: false,
        error: `LINE API ${res.status}`,
        httpStatus: res.status,
        errorType: "line_api_rejected",
      };
    }

    return { success: true };
  } catch {
    return {
      success: false,
      error: "LINE API request failed",
      httpStatus: null,
      errorType: "network_error",
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

export interface LineFlexMessage {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
}

export type LineMessage = LineTextMessage | LineFlexMessage;

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
