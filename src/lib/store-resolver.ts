import { cache } from "react";
import { AppError } from "@/lib/errors";
import {
  contactStoreUrl as FALLBACK_CONTACT_URL,
  storeAddress as FALLBACK_STORE_ADDRESS,
  storeMapUrl as FALLBACK_STORE_MAP_URL,
} from "@/lib/liff/messages";

/**
 * Store resolver — 從 slug / storeId 解析 store 資訊。
 *
 * 用於 /s/[storeSlug]/* 路由、server actions、auth callback 等場景。
 * 使用 React.cache() 確保同一 request 只查一次。
 */

/**
 * 把「null / undefined / 空字串 / 純 whitespace」一律 normalize 為 `null`。
 * 非空值原樣回傳（不 trim 內容）。
 *
 * 為何需要：JS 的 `??` 只 catch null/undefined，**不** catch 空字串——
 * 若 DB 或 env 內塞了 `""`，nullish chain 會把 `""` 當有效值傳給 UI，
 * 而下游程式碼若用 `=== null` 判斷會把空字串誤認「已設定」。
 *
 * PR-E patch（liffId 空字串 hardening）：resolveStorePresentation 與
 * scripts/backfill-store-presentation.ts 共用此 helper，確保「空字串 ≡ 缺值」
 * 在整條 read/write path 上一致。
 */
export function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  return v.trim() === "" ? null : v;
}

type StoreInfo = { id: string; slug: string; name: string };

/**
 * 從 slug 查詢 store（回傳 null 表示不存在）
 *
 * PR-E patch（Codex P1）：select **不含** `liffId`，保留 PR-E 前的 {id, slug, name}。
 *
 * 為什麼：此 resolver 有 22+ 個呼叫點（auth.ts / store-context / server actions /
 * webhook 等非 LIFF 路徑）。若這裡 select liffId，當 PR-E migration 還沒套用前 deploy
 * 新 code，所有呼叫端會 P2022 missing-column → 全站 store-scoped 路徑（含登入）炸。
 *
 * liffId 改由 `resolveStorePresentation` 內部另外查（只 LIFF page 用）；
 * 即使 deploy 順序錯誤，blast radius 收斂到 7 個 LIFF page，其他 22+ 路徑無感。
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

// ─────────────────────────────────────────────────────────────────────────────
// PR-E：per-store presentation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-store LIFF 顯示用聚合資訊（PR-E）。
 *
 * Server-side 在 7 個 LIFF page.tsx 解析一次，以 props 傳給 client 元件，
 * 取代既有「client 直接 import `src/lib/liff/messages.ts` 常數」的反模式。
 *
 * 欄位來源（per spec sheet 1）：
 *   - liffId     : Store.liffId（DB） → NEXT_PUBLIC_LIFF_ID_<SLUG> env var（過渡期 fallback）
 *                  → null（callsite 顯示 NotOpenForLiff UI）
 *   - contactUrl : ShopConfig.lineOfficialUrl → 常數 FALLBACK_CONTACT_URL
 *   - address    : ShopConfig.address          → 常數 FALLBACK_STORE_ADDRESS
 *   - mapUrl     : ShopConfig.mapUrl           → 常數 FALLBACK_STORE_MAP_URL
 *
 * HealthFlow URL 不在此 PR per-store（per spec 1.5 + 用戶決策 A）：
 *   仍由 client 直接 import `healthFlowLiffUrl`；本介面不回傳。
 */
export type StorePresentation = {
  id: string;
  slug: string;
  name: string;
  /** LIFF ID；null = 該店尚未開通 Mini App（page 應顯示 NotOpenForLiff） */
  liffId: string | null;
  /** LINE OA 連結（聯絡店家），絕不為空字串 */
  contactUrl: string;
  /** 店家地址（顯示用），絕不為空字串 */
  address: string;
  /** Google Maps 短網址（導航），絕不為空字串 */
  mapUrl: string;
};

/**
 * 給 LIFF page.tsx 使用：依 slug 解析 store + per-store 顯示用欄位。
 *
 * 設計重點：
 *   1. 缺值一律 fallback 到常數（FALLBACK_*）——任何時點 LIFF 不空白
 *   2. liffId 例外：env var 才是最後的過渡 fallback，皆無則 null（讓 page 顯示「尚未開通」）
 *   3. 用 React.cache 包裝 → 同一 request 多次呼叫只查 1 次（同 resolveStoreBySlug）
 *   4. 不 throw；找不到店 → 回 null，由 page render NotOpenForLiff
 *
 * Codex P1 patch（deploy 順序 hardening）：
 *   `Store.liffId` 不從 resolveStoreBySlug select，改在這裡 `Promise.all` 內另查。
 *   原因：resolveStoreBySlug 有 22+ 個呼叫點（auth / store-context / server actions），
 *   若它 select 新欄位 liffId，當 migration 還沒套用前 deploy 新 code，全站會 P2022
 *   missing-column → 登入也壞。改成 LIFF-only 的 separate query 後，blast radius
 *   收斂到 7 個 LIFF page（other 22+ paths 對 PR-E migration 順序無感）。
 *
 * @returns null 表示 slug 不存在於 DB
 */
export const resolveStorePresentation = cache(
  async (slug: string): Promise<StorePresentation | null> => {
    const store = await resolveStoreBySlug(slug);
    if (!store) return null;

    const { prisma } = await import("@/lib/db");
    // PR-E patch（Codex P1）：liffId 與 shopConfig 平行查；只 LIFF page 走這裡。
    // 兩個 query 都 select 最小欄位集合，避免新增任何 ShopConfig 欄位後波及。
    const [storeLiffRow, cfg] = await Promise.all([
      prisma.store.findUnique({
        where: { id: store.id },
        select: { liffId: true },
      }),
      prisma.shopConfig.findUnique({
        where: { storeId: store.id },
        select: { lineOfficialUrl: true, address: true, mapUrl: true },
      }),
    ]);

    // 過渡期 LIFF ID fallback：未填 Store.liffId 時讀 env，env 也無則 null。
    // 等 prod backfill 完成且 7 頁皆 wire 完，env 可在後續 PR 移除。
    //
    // PR-E patch（空字串 hardening）：DB / env 任一邊塞 `""` 時走同一條 fallback，
    // 否則 ?? 會放行空字串、下游 `=== null` 檢查會誤認為「已配置」。
    // emptyToNull 把 null / undefined / "" / "   " 全 normalize 為 null。
    const envLiffId = emptyToNull(
      process.env[`NEXT_PUBLIC_LIFF_ID_${slug.toUpperCase()}`]
    );

    return {
      id: store.id,
      slug: store.slug,
      name: store.name,
      liffId: emptyToNull(storeLiffRow?.liffId) ?? envLiffId ?? null,
      contactUrl: cfg?.lineOfficialUrl ?? FALLBACK_CONTACT_URL,
      address: cfg?.address ?? FALLBACK_STORE_ADDRESS,
      mapUrl: cfg?.mapUrl ?? FALLBACK_STORE_MAP_URL,
    };
  }
);
