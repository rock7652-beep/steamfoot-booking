import { liffMessages } from "@/lib/liff/messages";

/**
 * LIFF route group loading boundary (P0-1)。
 *
 * Next.js App Router 在 server component await 期間自動渲染此檔，
 * 取代 Next.js 預設「白頁」體驗，避免顧客在等資料時看到突兀空白。
 *
 * 設計要點：
 *   - Server component（不加 "use client"），純靜態 markup
 *   - 視覺與 `liff-shell.tsx` 的 `Loading` sub-block 一致，避免 layout shift
 *   - 不做 fetch / auth / side effect
 *   - 文案統一從 `liffMessages` 取（沿用既有 shell.initializing，
 *     避免擴大 messages.ts diff；顧客看到的是同樣的 spinner + 同樣的提示語）
 *
 * 涵蓋範圍：`/liff`、`/liff/onboarding`、`/liff/trial-booking`、
 *           `/liff/member-booking`、`/liff/bookings`、`/liff/wallets`、
 *           `/liff/health` — 所有 (liff) group 下的 server component 載入皆套用。
 */
export default function LiffLoading() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-earth-200 bg-white px-4 py-8 text-center">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-earth-300 border-t-earth-700"
          aria-hidden
        />
        <p className="text-sm text-earth-600">
          {liffMessages.shell.initializing}
        </p>
      </div>
    </div>
  );
}
