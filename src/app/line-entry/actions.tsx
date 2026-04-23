"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { trackReferralEvent } from "@/server/actions/referral-events";

// Cookie 命名：與 signIn callback / customer-auth.ts 共用，不要改
//   - pending-ref        — 已解析的推薦人 Customer.id（OAuth signIn 綁 sponsorId 讀這個）
//   - referral-visitor-token — 匿名訪客 token（跨流程追蹤同一訪客）
//   - oauth-store-slug   — OAuth callback 解析 store 用（login 頁也是這樣傳）
const PENDING_REF_COOKIE = "pending-ref";
const VISITOR_TOKEN_COOKIE = "referral-visitor-token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 天
const OAUTH_STORE_COOKIE_MAX_AGE = 60 * 10; // 10 分鐘就好，OAuth roundtrip 用

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
  const token =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `v-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  writeCookie(VISITOR_TOKEN_COOKIE, token, COOKIE_MAX_AGE);
  return token;
}

interface Props {
  /** LINE 官方帳號 URL（次要 CTA） */
  lineOfficialUrl: string;
  /** 店家 slug（LINE 登入 callback 導向 /s/{slug}/book） */
  storeSlug: string;
  /** 推薦人 Customer.id（server 已把 referralCode/customer.id 解析為 id） */
  referrerCustomerId?: string | null;
  /** 店家 id（事件埋點；無值時不寫事件） */
  storeId?: string | null;
  /** 事件 source 標記 */
  source?: string | null;
}

/**
 * /line-entry 中繼頁的 CTA 區 + cookie 寫入。
 *
 * 行為：
 *   1. mount 時寫入 pending-ref cookie（有推薦人才寫）+ visitor token
 *      → OAuth signIn callback 讀 pending-ref 綁 sponsorId
 *   2. 主按鈕「用 LINE 登入開始」：寫 oauth-store-slug cookie → signIn("line")
 *      → callbackUrl 帶 /s/{slug}/book，登入完成後導到預約頁
 *   3. 次按鈕「先加入官方 LINE」：外連 LINE OA URL（不登入、不建帳）
 *
 * 不再做的事：
 *   - 自動跳轉（使用者自己選）
 */
export function LineEntryActions({
  lineOfficialUrl,
  storeSlug,
  referrerCustomerId,
  storeId,
  source,
}: Props) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    ensureVisitorToken();
    if (referrerCustomerId) {
      writeCookie(PENDING_REF_COOKIE, referrerCustomerId, COOKIE_MAX_AGE);
    }
  }, [referrerCustomerId]);

  async function handleLineLogin() {
    setLoading(true);
    try {
      // auth.ts signIn callback 讀 oauth-store-slug 解析 store context
      writeCookie("oauth-store-slug", storeSlug, OAUTH_STORE_COOKIE_MAX_AGE);

      // fire-and-forget 埋 LINE_JOIN 事件（不 await、失敗不擋）
      if (storeId) {
        void trackReferralEvent({
          storeId,
          referrerId: referrerCustomerId ?? null,
          type: "LINE_JOIN",
          source: source ?? "line-entry-login",
        });
      }

      await signIn("line", { callbackUrl: `/s/${storeSlug}/book` });
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* 主 CTA：LINE 登入 */}
      <button
        type="button"
        disabled={loading}
        onClick={handleLineLogin}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#06C755] py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-[#05b54d] active:scale-[0.98] disabled:opacity-60"
      >
        {loading ? (
          <svg
            className="h-5 w-5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
        ) : (
          <LineGlyph />
        )}
        {loading ? "登入中..." : "用 LINE 登入開始"}
      </button>

      {/* 次 CTA：加入官方 LINE */}
      <a
        href={lineOfficialUrl}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#06C755] bg-white py-3 text-sm font-medium text-[#06C755] transition hover:bg-[#06C755]/5 active:scale-[0.98]"
      >
        <LineGlyph />
        先加入官方 LINE
      </a>

      <p className="text-center text-[11px] text-earth-400">
        {referrerCustomerId
          ? "登入後系統會自動綁定推薦人"
          : "用 LINE 登入可直接開始預約"}
      </p>
    </div>
  );
}

function LineGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}
