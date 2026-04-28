import { cache } from "react";
import { AppError } from "@/lib/errors";
import { isOwner } from "@/lib/permissions";

type SessionLike = { role: string; storeId?: string | null };

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
 * ⚠ 寫入操作永遠使用 JWT 中的 storeId，不受 cookie 視角影響。
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
  if (user.storeId) return user.storeId;
  if (!isOwner(user.role)) {
    throw new AppError("UNAUTHORIZED", "缺少 storeId，請重新登入");
  }
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value;
  if (!cookieStoreId || cookieStoreId === "__all__") {
    throw new AppError("VALIDATION", "請先在上方切換到指定分店，再執行此操作");
  }
  return cookieStoreId;
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
 * ⚠ 此函式僅用於「讀取」場景。寫入操作必須用 currentStoreId()。
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
    if (!isOwner(user.role)) return user.storeId ?? null;
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
    return resolveActiveStoreId(user, cookieStoreId);
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
