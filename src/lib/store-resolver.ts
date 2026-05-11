import { cache } from "react";
import { AppError } from "@/lib/errors";

/**
 * Store resolver — 從 slug / storeId 解析 store 資訊。
 *
 * 用於 /s/[storeSlug]/* 路由、server actions、auth callback 等場景。
 * 使用 React.cache() 確保同一 request 只查一次。
 */

type StoreInfo = { id: string; slug: string; name: string };

/**
 * 從 slug 查詢 store（回傳 null 表示不存在）
 */
export const resolveStoreBySlug = cache(async (slug: string): Promise<StoreInfo | null> => {
  const { prisma } = await import("@/lib/db");
  const store = await prisma.store.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
  return store;
});

/**
 * 從 slug 取得 storeId，找不到則拋出 NOT_FOUND
 */
export async function resolveStoreIdFromSlug(slug: string): Promise<string> {
  const store = await resolveStoreBySlug(slug);
  if (!store) {
    throw new AppError("NOT_FOUND", `找不到店舖：${slug}`);
  }
  return store.id;
}

/**
 * 從 storeId 反查 slug（用於構造 redirect URL）
 */
export const getStoreSlugById = cache(async (storeId: string): Promise<string | null> => {
  const { prisma } = await import("@/lib/db");
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { slug: true },
  });
  return store?.slug ?? null;
});

/**
 * 從 request headers 讀取 store context（由 proxy.ts 注入）
 */
export async function getStoreFromHeaders(): Promise<{ storeId: string; storeSlug: string } | null> {
  const { headers } = await import("next/headers");
  const headerStore = await headers();
  const storeId = headerStore.get("x-store-id");
  const storeSlug = headerStore.get("x-store-slug");
  if (storeId && storeSlug) {
    return { storeId, storeSlug };
  }
  return null;
}

/**
 * 從 OAuth cookie 讀取 store slug（LINE / Google 登入用）
 *
 * 回傳 null 代表無法判定店別（cookie 遺失 或 slug 在 DB 中不存在）。
 * 多店環境下不可靜默 fallback 到 DEFAULT_STORE_ID — 否則 Safari 第三方 cookie
 * 政策吃掉 cookie 時，新店顧客會被建立到預設店，造成跨店資料污染。
 * Caller 必須處理 null：中止登入並導向錯誤頁，請使用者重新從 /s/{slug}/ 入口進入。
 */
export async function resolveStoreFromOAuthCookie(): Promise<{ storeId: string; storeSlug: string } | null> {
  const { cookies } = await import("next/headers");

  const cookieStore = await cookies();
  const oauthSlug = cookieStore.get("oauth-store-slug")?.value;

  if (!oauthSlug) return null;

  const store = await resolveStoreBySlug(oauthSlug);
  if (!store) return null;

  return { storeId: store.id, storeSlug: store.slug };
}
