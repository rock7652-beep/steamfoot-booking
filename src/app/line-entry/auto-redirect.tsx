"use client";

import { useEffect } from "react";
import { trackReferralEvent } from "@/server/actions/referral-events";

interface Props {
  lineUrl: string;
  delayMs?: number;
  /** 推薦碼（非 null 時寫入 document.cookie；30 天） */
  refCode?: string | null;
  /** 店家 id（用於事件埋點；無值時不寫事件） */
  storeId?: string | null;
  /** 事件 source 標記 */
  source?: string | null;
}

const REFERRAL_COOKIE_NAME = "pending-ref";
const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

/**
 * 中繼頁的延遲導向 + 推薦碼 cookie 寫入 + LINE_JOIN 埋點。
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
  refCode,
  storeId,
  source,
}: Props) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 寫入 pending-ref cookie（client-side）
    if (refCode) {
      const encoded = encodeURIComponent(refCode);
      document.cookie = `${REFERRAL_COOKIE_NAME}=${encoded}; path=/; max-age=${REFERRAL_COOKIE_MAX_AGE}; SameSite=Lax`;
    }

    // 已自動跳過一次就不再跳
    if (sessionStorage.getItem("line-entry-auto-redirected") === "1") return;
    const timer = window.setTimeout(() => {
      sessionStorage.setItem("line-entry-auto-redirected", "1");

      // LINE_JOIN 事件埋點（fire-and-forget；失敗不阻擋跳轉）
      if (storeId) {
        void trackReferralEvent({
          storeId,
          referrerId: refCode ?? null,
          type: "LINE_JOIN",
          source: source ?? "line-entry-auto",
        });
      }

      window.location.href = lineUrl;
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [lineUrl, delayMs, refCode, storeId, source]);

  return null;
}
