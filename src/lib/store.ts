import { cache } from "react";
import { AppError } from "@/lib/errors";
import { isOwner } from "@/lib/permissions";

type SessionLike = { role: string; storeId?: string | null };

export const ALL_STORES_ID = "__all__";

type StoreAccessMode = "read" | "write" | "switch";

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
    if (!isOwner(user.role)) {
      throw new AppError("FORBIDDEN", "無權查看全部分店");
    }
    return null;
  }

  if (!requestedStoreId) {
    throw new AppError("VALIDATION", "請先在上方切換到指定分店");
  }

  // Non-ADMIN staff are always pinned to their session store. A forged cookie
  // or client-supplied id can never widen their access.
  if (!isOwner(user.role) && requestedStoreId !== user.storeId) {
    throw new AppError("FORBIDDEN", "無權操作此店舖");
  }

  // The authenticated session store is the sole authority for non-ADMIN
  // staff. They never consume the active-store cookie, so no client-controlled
  // value reaches this branch and an extra Store lookup is unnecessary.
  if (!isOwner(user.role)) return requestedStoreId;

  const { prisma } = await import("@/lib/db");
  const store = await prisma.store.findUnique({
    where: { id: requestedStoreId },
    select: { id: true },
  });
  if (!store) {
    throw new AppError("NOT_FOUND", "店舖不存在或已無法存取");
  }

  return store.id;
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
  if (user.storeId) {
    return (await validateStoreAccess(user, user.storeId, "write"))!;
  }
  if (!isOwner(user.role)) {
    throw new AppError("UNAUTHORIZED", "缺少 storeId，請重新登入");
  }
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value;
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
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return stores.map((s) => s.id);
}

/**
 * 取得 ADMIN 可選的店舖清單（含「全部」選項）
 * React cache 同一 request 多處呼叫只查一次（layout / 各頁面共享）。
 */
export const getStoreOptions = cache(
  async (): Promise<Array<{ id: string; name: string; isDefault: boolean }>> => {
    const { prisma } = await import("@/lib/db");
    return prisma.store.findMany({
      select: { id: true, name: true, isDefault: true },
      orderBy: { createdAt: "asc" },
    });
  },
);

/**
 * 取得使用者的有效查詢 storeId
 *
 * - ADMIN: 讀 cookie `active-store-id`，若為 "__all__" 回傳 null（全部），否則回傳指定店
 * - 非 ADMIN: 回傳 session.storeId
 *
 * ⚠ 此函式僅做純值解析。需要信任 cookie 的讀寫入口必須再走
 * validateStoreAccess()；mutation 一律使用 resolveWriteStoreId()。
 */
export function resolveActiveStoreId(
  user: SessionLike,
  cookieStoreId?: string | null
): string | null {
  if (isOwner(user.role) && cookieStoreId) {
    if (cookieStoreId === "__all__") return null;
    return cookieStoreId;
  }
  return user.storeId ?? null;
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
    if (!isOwner(user.role)) {
      if (!user.storeId) return null;
      return validateStoreAccess(user, user.storeId, "read");
    }
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
    if (!cookieStoreId) return null;
    return validateStoreAccess(user, cookieStoreId, "read");
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
