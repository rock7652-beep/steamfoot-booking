/**
 * LIFF ID 對應表 + 解析 helper (P1-3 集中化)。
 *
 * 為何抽：
 *   - 此 dictionary 在 7 個 `src/app/(liff)/liff/**\/page.tsx` 各自宣告一份
 *     (`/liff`, `/liff/onboarding`, `/liff/trial-booking`,
 *     `/liff/member-booking`, `/liff/bookings`, `/liff/wallets`,
 *     `/liff/health`)
 *   - 任何新增 slug（例如多店上線 PR-C 開新竹店）都要改 7 個檔，容易漏改
 *   - 抽出後唯一 source of truth；多店 onboarding 只動此檔
 *
 * 未來路線：
 *   - PR-E 預計把 LIFF ID 從 env-var dictionary 改為 `Store.liffId` schema 欄位
 *     （schema 已預留，prod 未填）
 *   - 那時把這支檔內部換成 `prisma.store.findUnique({...})`，
 *     `resolveLiffIdBySlug` 的 export 介面不變 → 7 個 page.tsx 不用再動
 *
 * 行為保證（與原 7 處 inline dict 完全等價）：
 *   - 找不到 slug 對應 → 回 `undefined`
 *   - 對應 env-var 沒設 → 也回 `undefined`
 *   - callsite 看到 `undefined` 就顯示「尚未開通」（路徑不變）
 *
 * 不做：
 *   - 不讀 DB（與原行為一致；env-var lookup only）
 *   - 不 throw（找不到就 `undefined`，讓 callsite 用 UI fallback 處理）
 *   - 不寫 inline 中文（callsite 已負責「尚未開通」UI 文案）
 */

/**
 * MVP 期：每店一個 `NEXT_PUBLIC_LIFF_ID_*` env var，明示對應關係。
 *
 * PR-E 之後：`Store.liffId` 已進 schema；新的 LIFF page 改走
 * `resolveStorePresentation(slug).liffId`（src/lib/store-resolver.ts）。
 * env 變數只在 `resolveStorePresentation` 內部當「DB 未填」的過渡 fallback；
 * 新店上線只需在後台填 `Store.liffId`，不必再改 code 對照表。
 *
 * 本檔保留 export 是為了：
 *   1. 不破壞 P1-3 既有 unit test 與第三方匯入
 *   2. PR-E 後續清理階段（backfill 全部 store 完成）一次性移除
 *
 * @deprecated PR-E：請改用 `resolveStorePresentation(slug).liffId`。
 */
export const LIFF_ID_BY_SLUG: Record<string, string | undefined> = {
  zhubei: process.env.NEXT_PUBLIC_LIFF_ID_ZHUBEI,
  staging: process.env.NEXT_PUBLIC_LIFF_ID_STAGING,
};

/**
 * Resolve LIFF ID by store slug.
 *
 * @returns LIFF ID string when both the slug is registered AND its env-var
 *          is set; otherwise `undefined` (callsite renders「尚未開通」UI).
 *
 * @deprecated PR-E：請改用 `resolveStorePresentation(slug).liffId`。新店家應在
 *             `Store.liffId` 欄位設值，不再依賴 env 對照表。
 */
export function resolveLiffIdBySlug(slug: string): string | undefined {
  return LIFF_ID_BY_SLUG[slug];
}
