"use client";

import { useEffect } from "react";

interface Props {
  lineUrl: string;
  delayMs?: number;
  /** 推薦碼（非 null 時寫入 document.cookie；30 天） */
  refCode?: string | null;
}

const REFERRAL_COOKIE_NAME = "pending-ref";
const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

/**
 * 中繼頁的延遲導向 + 推薦碼 cookie 寫入。
 *
 * 為什麼 cookie 在 client 寫：
 *   Next.js 的 Server Component 無法 cookies().set()，只能在 Server Action
 *   或 Route Handler 裡改。避免多拉一個 route 或 action，直接在 client 寫。
 *   這個 cookie 後續由註冊/LINE login 流程讀取以綁定 sponsorId。
 *
 * 自動跳轉：進頁後等 delayMs（預設 2.5 秒）讓使用者感知品牌與推薦訊息，
 *   然後才 redirect 到 LINE 官方帳號。若使用者在延遲內已點 CTA，則不會觸發。
 *   使用 sessionStorage 標記避免重覆自動跳（使用者按返回不會又被踢走）。
 */
export function LineEntryAutoRedirect({
  lineUrl,
  delayMs = 2500,
  refCode,
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
      window.location.href = lineUrl;
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [lineUrl, delayMs, refCode]);

  return null;
}
