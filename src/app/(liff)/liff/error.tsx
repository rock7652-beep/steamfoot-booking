"use client";

import { useEffect } from "react";
import { contactStoreUrl, liffMessages } from "@/lib/liff/messages";

/**
 * LIFF route group error boundary (P0-1)。
 *
 * 任何 (liff) group 下的 server component / client component 在 render 期間
 * throw 都會落到這裡，取代 Next.js 預設英文錯誤頁。
 *
 * 設計要點：
 *   - Client component（Next.js 規範：error.tsx 必須是 "use client"）
 *   - 不顯示技術錯誤細節：不 render `error.message` / `error.stack`，
 *     避免暴露任何 secret / token / customerId / lineUserId / DB 錯誤訊息
 *   - 只 console.error 一個 Next.js 預先去敏的 `digest`（prod build 會把
 *     error.message 用 hash 取代，可在 Vercel log 比對；不含 PII）
 *   - 提供兩條出路：
 *       1. 「重新整理」→ 優先呼叫 Next.js `reset()` 嘗試 re-render；失敗則 reload
 *       2. 「聯繫店家」→ contactStoreUrl (LINE OA)
 *   - 視覺與 `liff-shell.tsx` 的 red InfoBlock 一致，避免顧客感覺被丟到不同系統
 *
 * 不做：
 *   - 不打 API / 不重抓資料（避免錯誤迴圈）
 *   - 不寫 inline 中文（一律從 liffMessages 取，沿用既有 error.* 字串）
 *   - 不 retry on mount（只在使用者主動點按鈕時 reset）
 *
 * 涵蓋範圍：`/liff`、`/liff/onboarding`、`/liff/trial-booking`、
 *           `/liff/member-booking`、`/liff/bookings`、`/liff/wallets`、
 *           `/liff/health` — 所有 (liff) group 下的渲染錯誤皆套用。
 */
export default function LiffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // digest 是 Next.js prod build 對 error.message 的去敏 hash；
    // 不含 stack trace、不含 PII。可在 Vercel log 用相同 digest 對照 server 端原始錯誤。
    console.error("[liff/error]", { digest: error.digest });
  }, [error]);

  const handleRetry = () => {
    try {
      reset();
    } catch {
      // reset() 罕見情況下也可能 throw（例如 Suspense boundary unmount）；
      // 兜底走完整 reload，至少保證顧客有出路。
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-900">
        <p className="text-xs break-words opacity-90">
          {liffMessages.error.serviceUnavailable}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-md border border-current bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white"
          >
            {liffMessages.error.retryCta}
          </button>
          <a
            href={contactStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-current bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white"
          >
            {liffMessages.error.contactStoreCta}
          </a>
        </div>
      </div>
    </div>
  );
}
