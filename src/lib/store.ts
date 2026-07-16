import { cache } from "react";
import { AppError } from "@/lib/errors";
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import { VIEWED_STORE_COOKIE_NAME } from "@/lib/store-view-mode-constants";

type SessionLike = { role: string; storeId?: string | null };

export const ALL_STORES_ID = "__all__";

export type StoreAccessMode = "read" | "write" | "switch";
export type AccessibleStore = { id: string; name: string; isDefault: boolean };

const MAX_STORE_TREE_DEPTH = 20;

async function getActiveDescendantStoreIds(ownStoreId: string): Promise<string[]> {
  const { prisma } = await import("@/lib/db");
  const descendants: string[] = [];
  const visited = new Set([ownStoreId]);
  let frontier = [ownStoreId];

  for (let depth = 0; depth < MAX_STORE_TREE_DEPTH && frontier.length; depth += 1) {
    const children = await prisma.store.findMany({
      where: { parentStoreId: { in: frontier }, operatingStatus: "ACTIVE" },
      select: { id: true },
    });
    const next: string[] = [];
    for (const child of children) {
      if (visited.has(child.id)) {
        throw new AppError("BUSINESS_RULE", "店舖組織不可形成循環關係");
      }
      visited.add(child.id);
      descendants.push(child.id);
      next.push(child.id);
    }
    frontier = next;
  }
  if (frontier.length) {
    throw new AppError("BUSINESS_RULE", "店舖組織層級過深，請檢查是否有循環關係");
  }
  return descendants;
}

export async function getAccessibleStores(user: SessionLike): Promise<AccessibleStore[]> {
  const { prisma } = await import("@/lib/db");
  if (user.role === "ADMIN") {
    return prisma.store.findMany({
      where: { operatingStatus: "ACTIVE" },
      select: { id: true, name: true, isDefault: true },
      orderBy: { createdAt: "asc" },
    });
  }
  if (!user.storeId) throw new AppError("UNAUTHORIZED", "缺少 storeId，請重新登入");

  const [ownStore] = await prisma.store.findMany({
    where: { id: user.storeId, operatingStatus: "ACTIVE" },
    select: { id: true, parentStoreId: true },
    take: 1,
  });
  if (!ownStore) throw new AppError("FORBIDDEN", "店舖已停用或無法存取");

  let ids = [user.storeId];
  const isMotherOwner = user.role === "OWNER" && ownStore.parentStoreId === null;
  if (isMotherOwner && await hasStoreFeature(user.storeId, FEATURES.MULTI_STORE)) {
    ids = [...ids, ...await getActiveDescendantStoreIds(user.storeId)];
  }
  const stores = await prisma.store.findMany({
    where: { id: { in: ids }, operatingStatus: "ACTIVE" },
    select: { id: true, name: true, isDefault: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return stores.map(({ id, name, isDefault }) => ({ id, name, isDefault }));
}

export async function getAccessibleStoreIds(user: SessionLike): Promise<string[]> {
  return (await getAccessibleStores(user)).map((store) => store.id);
}

/**
 * Central authorization boundary for store-scoped dashboard access.
 *
 * Cookie values are client-controlled input. Every concrete store id must be
 * checked here before it is used by a query or mutation. ADMIN currently has
 * platform-wide access, but that policy intentionally lives in this single
 * resolver so it can be narrowed later without changing every action.
 */
export async function validateStoreAccess(
  user: SessionLike,
  requestedStoreId: string,
  mode: StoreAccessMode,
): Promise<string | null> {
  if (requestedStoreId === ALL_STORES_ID) {
    if (mode === "write") {
      throw new AppError("VALIDATION", "請先在上方切換到指定分店，再執行此操作");
    }
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "無權查看全部分店");
    }
    return null;
  }

  if (!requestedStoreId) {
    throw new AppError("VALIDATION", "請先在上方切換到指定分店");
  }

  const accessibleIds = await getAccessibleStoreIds(user);
  if (!accessibleIds.includes(requestedStoreId)) {
    throw new AppError("FORBIDDEN", "店舖不存在、已停用或無權存取");
  }
  return requestedStoreId;
}

/**
 * 系統預設 storeId — 用於無 user context 的系統查詢（cron、cache preload 等）。
 * Cron jobs 使用 getAllActiveStoreIds() 迭代各店。
 *
 * @deprecated B7-4: 前台流程請改用 resolveStoreBySlug() / resolveStoreFromOAuthCookie()。
 * 此常數僅保留給 cron jobs、seed、系統層級查詢使用。
 */
export const DEFAULT_STORE_ID = "default-store";

/**
 * 取得當前使用者的 storeId，若不存在則拋出錯誤。
 * 用於 server action 中 create/update/delete 需要寫入 storeId 的場景。
 * @deprecated 設定類 mutation 請使用 resolveWriteStoreId()，讓 ADMIN
 * 使用經驗證的 active store，非 ADMIN 則固定使用 session store。
 */
export function currentStoreId(user: SessionLike): string {
  if (user.storeId) return user.storeId;
  throw new AppError(
    "UNAUTHORIZED",
    "缺少 storeId，請重新登入"
  );
}

/**
 * 取得寫入用的 storeId。
 * - OWNER / PARTNER：回傳 JWT session.storeId
 * - ADMIN：fallback 讀 cookie `active-store-id`，必須為具體 storeId（非 __all__）
 *   沒選定分店 → 拒絕寫入，回傳明確錯誤
 */
export async function resolveWriteStoreId(user: SessionLike): Promise<string> {
  if (user.role !== "ADMIN" && !user.storeId) {
    throw new AppError("UNAUTHORIZED", "缺少 storeId，請重新登入");
  }
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const cookieStoreId = user.role === "ADMIN"
    ? cookieStore.get("active-store-id")?.value
    : user.role === "OWNER"
      ? cookieStore.get(VIEWED_STORE_COOKIE_NAME)?.value ?? user.storeId
      : user.storeId;
  if (!cookieStoreId) {
    throw new AppError("VALIDATION", "請先在上方切換到指定分店，再執行此操作");
  }
  return (await validateStoreAccess(user, cookieStoreId, "write"))!;
}

/**
 * 取得所有 active store 的 ID（供 cron / background jobs 使用）
 */
export async function getAllActiveStoreIds(): Promise<string[]> {
  const { prisma } = await import("@/lib/db");
  const stores = await prisma.store.findMany({
    where: { operatingStatus: "ACTIVE" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return stores.map((s) => s.id);
}

/**
 * 取得 ADMIN 可選的店舖清單（含「全部」選項）
 * React cache 同一 request 多處呼叫只查一次（layout / 各頁面共享）。
 */
export const getStoreOptions = cache(getAccessibleStores);

/**
 * 取得使用者的有效查詢 storeId
 *
 * - ADMIN: 讀 cookie `active-store-id`，若為 "__all__" 回傳 null（全部），否則回傳指定店
 * - 非 ADMIN: 回傳 session.storeId
 *
 * ⚠ 此函式僅做純值解析。需要信任 cookie 的讀寫入口必須再走
 * validateStoreAccess()；mutation 一律使用 resolveWriteStoreId()。
 */
export async function resolveActiveStoreId(
  user: SessionLike,
  cookieStoreId?: string | null
): Promise<string | null> {
  if (user.role === "ADMIN" && cookieStoreId) {
    return validateStoreAccess(user, cookieStoreId, "read");
  }
  return getActiveStoreForRead(user);
}

/**
 * 從 cookie 讀取並解析 ADMIN 的有效查看 storeId。
 * 供 Server Component (讀取型頁面) 使用。
 *
 * - ADMIN: 讀 cookie，解析為具體 storeId 或 null（全部）
 * - 非 ADMIN: 回傳 user.storeId
 *
 * ⚠ 使用 next/headers cookies() 直接讀取，避免動態 import "use server" 模組的問題。
 */
export const getActiveStoreForRead = cache(
  async (user: SessionLike): Promise<string | null> => {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    if (user.role === "ADMIN") {
      const requested = cookieStore.get("active-store-id")?.value;
      return requested ? validateStoreAccess(user, requested, "read") : null;
    }
    if (!user.storeId) throw new AppError("UNAUTHORIZED", "缺少 storeId，請重新登入");
    const requested = user.role === "OWNER"
      ? cookieStore.get(VIEWED_STORE_COOKIE_NAME)?.value ?? user.storeId
      : user.storeId;
    return validateStoreAccess(user, requested, "read");
  },
);

/**
 * 從 middleware 設定的 cookie 取得網域對應的 storeId。
 * 用於前台公開頁面（如 /book），在無 session 時判斷歸屬店。
 * 回傳 null 代表不是自訂網域，走一般流程。
 */
export async function getDomainStoreId(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  return cookieStore.get("domain-store-id")?.value ?? null;
}
