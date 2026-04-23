"use client";

import { useEffect } from "react";
import { trackReferralEvent } from "@/server/actions/referral-events";

interface Props {
  lineUrl: string;
  delayMs?: number;
  /** 推薦人 Customer.id（server 已把 referralCode/customer.id 解析為 id） */
  referrerCustomerId?: string | null;
  /** 店家 id（用於事件埋點；無值時不寫事件） */
  storeId?: string | null;
  /** 事件 source 標記 */
  source?: string | null;
}

// Cookie 命名：固定、簡單、不散
//   - pending-ref        — 已解析的推薦人 Customer.id（註冊流程讀取以綁 sponsorId）
//   - referral-visitor-token — 匿名訪客 token（跨流程追蹤同一訪客；非敏感）
const PENDING_REF_COOKIE = "pending-ref";
const VISITOR_TOKEN_COOKIE = "referral-visitor-token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

function readCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]!) : null;
}

function writeCookie(name: string, value: string, maxAgeSec: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; SameSite=Lax`;
}

function ensureVisitorToken(): string {
  const existing = readCookie(VISITOR_TOKEN_COOKIE);
  if (existing) return existing;
  // crypto.randomUUID 在現代瀏覽器 (Chrome 92+, Safari 15.4+) 皆可用
  const token =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `v-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  writeCookie(VISITOR_TOKEN_COOKIE, token, COOKIE_MAX_AGE);
  return token;
}

/**
 * 中繼頁的延遲導向 + 推薦 cookie 寫入 + LINE_JOIN 埋點。
 *
 * 為什麼 cookie 在 client 寫：
 *   Next.js 的 Server Component 無法 cookies().set()，只能在 Server Action
 *   或 Route Handler 裡改。避免多拉一個 route 或 action，直接在 client 寫。
 *   這個 cookie 後續由註冊/LINE login 流程讀取以綁定 sponsorId。
 *
 * 自動跳轉：進頁後等 delayMs（預設 2.5 秒）讓使用者感知品牌與推薦訊息，
 *   然後才 redirect 到 LINE 官方帳號。若使用者在延遲內已點 CTA，則不會觸發。
 *   使用 sessionStorage 標記避免重覆自動跳（使用者按返回不會又被踢走）。
 *
 * LINE_JOIN 事件：在觸發跳轉時 fire-and-forget 寫一筆。
 *   不 await、不 throw；埋點失敗完全不影響跳轉。
 */
export function LineEntryAutoRedirect({
  lineUrl,
  delayMs = 2500,
  referrerCustomerId,
  storeId,
  source,
}: Props) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. 匿名訪客 token：不管有沒有 ref 都發一個（跨流程追蹤同一訪客）
    ensureVisitorToken();

    // 2. 推薦人 cookie：僅在 server 有解析到推薦人時寫入
    //    存的是已解析的 Customer.id，既有 customer-auth.ts 讀取邏輯不需改動
    if (referrerCustomerId) {
      writeCookie(PENDING_REF_COOKIE, referrerCustomerId, COOKIE_MAX_AGE);
    }

    // 已自動跳過一次就不再跳
    if (sessionStorage.getItem("line-entry-auto-redirected") === "1") return;
    const timer = window.setTimeout(() => {
      sessionStorage.setItem("line-entry-auto-redirected", "1");

      // LINE_JOIN 事件埋點（fire-and-forget；失敗不阻擋跳轉）
      if (storeId) {
        void trackReferralEvent({
          storeId,
          referrerId: referrerCustomerId ?? null,
          type: "LINE_JOIN",
          source: source ?? "line-entry-auto",
        });
      }

      window.location.href = lineUrl;
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [lineUrl, delayMs, referrerCustomerId, storeId, source]);

  return null;
}
