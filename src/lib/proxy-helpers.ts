/**
 * Pure helpers extracted from src/proxy.ts so vitest can unit-test them
 * without dragging in next/server (which proxy.ts depends on).
 *
 * 純函數、零 React、零 Next.js runtime；只依賴 Web 標準 Headers API。
 * 在 proxy.ts 內被使用；測試 src/__tests__/proxy-store-rewrite-request-headers.test.ts。
 */

/**
 * 建構 storeRewrite 時要 forward 給內部 request 的 headers（PR-E2 Codex P1 #2）。
 *
 * Clone 進來的 request headers，覆蓋 / 設定：
 *   - `x-store-slug`     ← 來自 URL `/s/<slug>/liff` 抽出的 slug
 *   - `x-next-pathname`  ← 原始 pathname（給 sidebar 高亮等 server 場景用）
 *
 * **這些必須走 request headers，不能只走 response headers**——Next.js Server
 * Component 的 `headers()` 讀的是 INCOMING request，不是 OUTGOING response。
 * 原本只寫 response.headers 的版本對 server component 等於沒寫，導致 PR-E2
 * strict gate 全部 LIFF page 拿到 null slug → 顯示「無法確認分店」。
 *
 * 安全考量：覆蓋 client 自己送的 `x-store-slug` header（防偽造）；proxy
 * 推導出來的 slug 才是 source of truth。
 *
 * 純函數：input Headers 不被 mutate（用 new Headers(...) 複製）。
 */
export function buildStoreRewriteRequestHeaders(
  reqHeaders: Headers,
  slug: string,
  pathname: string
): Headers {
  const requestHeaders = new Headers(reqHeaders);
  requestHeaders.set("x-store-slug", slug);
  requestHeaders.set("x-next-pathname", pathname);
  return requestHeaders;
}

/**
 * Builds a legacy-route redirect without dropping the incoming query string.
 * Notification deep links enter through legacy `/dashboard/*` URLs, so ids
 * such as `bookingId` and `leadId` must survive the store-scoped redirect.
 */
export function legacyRedirectUrl(reqUrl: URL, destinationPath: string): URL {
  const destination = new URL(destinationPath, reqUrl);
  destination.search = reqUrl.search;
  return destination;
}
