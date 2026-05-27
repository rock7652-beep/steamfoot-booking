import { liffMessages } from "@/lib/liff/messages";

/**
 * (liff) route group not-found 頁（PR-E2）。
 *
 * 當 LIFF page server component 呼叫 `notFound()` 時 Next.js 渲染本檔。
 *
 * 觸發場景：
 *   - storeSlug 在 URL 帶到了，但 `resolveStorePresentation(slug)` 回 null
 *     （DB 找不到該店）→ 例：URL typo / 已停業店 / 開發中假 slug
 *
 * 為何**不**走 NotOpenForLiff 的 LIFF 風格 header：
 *   - per PR-E2 spec：「不要顯示 NotOpenForLiff」——這是設計上故意區分
 *     「店不存在」(本頁) vs 「店存在但未開通 LIFF」(NotOpenForLiff)
 *   - 顧客直覺：URL 錯誤 ≠ LIFF 服務問題
 *
 * 為何不用 Next.js 預設英文 404：
 *   - 顧客在 LINE webview 內，英文 404 既粗魯也沒指引
 *
 * 設計：簡短中文 + 引導從 LINE menu 重進。視覺刻意比 NotOpenForLiff 樸素，
 * 不掛「LINE Mini App」title（避免被誤認為是已開通的服務）。
 */
export default function LiffNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
      <p className="text-base text-earth-700">{liffMessages.error.storeNotFound}</p>
      <p className="text-xs text-earth-500">
        {liffMessages.error.storeNotFoundHint}
      </p>
    </div>
  );
}
