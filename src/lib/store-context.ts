/**
 * Store context helpers — 從 proxy.ts 注入的 cookies 讀取 store context。
 *
 * Client components: useStoreSlug()
 * Server components / Server actions: getStoreContext()
 */

// ============================================================
// Client-side hook
// ============================================================

export { useStoreSlug, useStoreSlugRequired, storeHref } from "./store-context-client";

// ============================================================
// Server-side (Server Components / Server Actions)
// ============================================================

/**
 * 從 cookies 讀取 store context（Server Component / Server Action 用）。
 * B7-4.5: proxy 僅注入 store-slug cookie，storeId 從 DB 解析。
 */
export async function getStoreContext(): Promise<{ storeSlug: string; storeId: string } | null> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const storeSlug = cookieStore.get("store-slug")?.value;
  if (!storeSlug || storeSlug === "__hq__") return null;

  // B7-4.5: 從 DB 解析 storeId（不依賴靜態 map）
  const { resolveStoreBySlug } = await import("@/lib/store-resolver");
  const store = await resolveStoreBySlug(storeSlug);
  if (!store) return null;

  return { storeSlug: store.slug, storeId: store.id };
}

/**
 * 從 cookies 讀取 storeId，保證有值（否則 throw）
 */
export async function requireStoreContext(): Promise<{ storeSlug: string; storeId: string }> {
  const ctx = await getStoreContext();
  if (!ctx) {
    const { AppError } = await import("@/lib/errors");
    throw new AppError("UNAUTHORIZED", "缺少店舖 context，請從正確的分店入口進入");
  }
  return ctx;
}
