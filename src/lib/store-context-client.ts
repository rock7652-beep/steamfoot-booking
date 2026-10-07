/**
 * 從 URL 路徑讀取 storeSlug（client-side）。
 * 優先從 pathname 解析 /s/[slug]，fallback 到 cookie。
 */
export function useStoreSlug(): string | null {
  if (typeof window === "undefined") return null;

  // 優先從 URL 路徑解析（rewrite 後瀏覽器仍顯示 /s/[slug]/... ）
  const match = window.location.pathname.match(/^\/s\/([^/]+)/);
  if (match) return match[1];

  // Fallback: 從 cookie 讀取
  const cookieMatch = document.cookie.match(/(?:^|;\s*)store-slug=([^;]+)/);
  return cookieMatch ? cookieMatch[1] : null;
}

/**
 * 從 URL 路徑或 cookie 取得 storeSlug，保證有值（fallback "zhubei"）
 */
export function useStoreSlugRequired(): string {
  return useStoreSlug() ?? "zhubei";
}

/**
 * 構造 store-scoped 路徑
 */
export function storeHref(storeSlug: string, path: string): string {
  return `/s/${storeSlug}${path}`;
}

