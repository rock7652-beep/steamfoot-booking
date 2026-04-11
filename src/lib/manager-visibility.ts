/**
 * Manager 可視範圍（Visibility Mode）+ 多店隔離
 *
 * 控制非 Admin 員工在各功能模組中能看到多少資料。
 *
 * 模式定義：
 * - SELF_ONLY: 只看到自己名下的資料
 * - STORE_SHARED: 可以看到全店資料（只讀），但仍只能操作自己名下的
 *
 * 多店隔離：
 * - ADMIN: 不加 storeId 篩選（跨店管理）
 * - STORE_MANAGER / COACH: 強制 storeId = user.storeId
 * - CUSTOMER: 只看自己的資料（storeId 作為額外保護）
 */

import { isOwner, isNonOwnerStaff } from "@/lib/permissions";

export type VisibilityMode = "SELF_ONLY" | "STORE_SHARED";

// 簡化型別：session user 常用欄位
type SessionLike = { role: string; storeId?: string | null; staffId?: string | null };

/**
 * 取得當前生效的 Manager 可視範圍模式
 */
export function getVisibilityMode(): VisibilityMode {
  const envMode = process.env.MANAGER_VISIBILITY_MODE;
  if (envMode === "SELF_ONLY") return "SELF_ONLY";
  return "STORE_SHARED";
}

// ============================================================
// 多店隔離 — 核心 helper
// ============================================================

/**
 * 回傳 storeId 篩選條件
 * - ADMIN: {} （不篩選）
 * - 其他角色: { storeId: user.storeId }
 * - 無 storeId: { storeId: "__IMPOSSIBLE__" } （安全預設，不回傳任何資料）
 */
export function getStoreFilter(user: SessionLike): Record<string, unknown> {
  if (isOwner(user.role)) return {};
  if (!user.storeId) return { storeId: "__IMPOSSIBLE__" };
  return { storeId: user.storeId };
}

/**
 * 驗證某筆記錄是否屬於當前使用者的店舖
 * ADMIN 永遠通過，其他角色比對 storeId
 */
export function assertStoreAccess(
  user: SessionLike,
  recordStoreId: string
): void {
  if (isOwner(user.role)) return;
  if (user.storeId !== recordStoreId) {
    // 動態 import 以避免循環依賴
    throw new Error("FORBIDDEN: 無權存取其他店舖的資料");
  }
}

// ============================================================
// 員工可視範圍篩選（含多店隔離）
// ============================================================

/**
 * 根據可視範圍回傳員工查詢篩選條件
 * 自動加入 storeId 篩選（非 ADMIN）
 */
export function getManagerReadFilter(
  role: string,
  staffId: string | null,
  filterField: "assignedStaffId" | "revenueStaffId" | "staffId",
  storeId?: string | null
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  // 多店篩選：非 ADMIN 強制加入 storeId
  if (!isOwner(role) && storeId) filter.storeId = storeId;

  // Admin 不加員工篩選（但已加 storeId if provided）
  if (isOwner(role)) return filter;

  // 非員工或沒有 staffId → 空結果（安全預設）
  if (!isNonOwnerStaff(role) || !staffId) return { ...filter, [filterField]: "__IMPOSSIBLE__" };

  const mode = getVisibilityMode();

  if (mode === "STORE_SHARED") {
    return filter;
  }

  // SELF_ONLY → 只看自己
  return { ...filter, [filterField]: staffId };
}

/**
 * 回傳巢狀 customer 篩選（用於 booking 查詢中透過 customer.assignedStaffId 篩選）
 * 自動加入 storeId 篩選（非 ADMIN）
 */
export function getManagerCustomerFilter(
  role: string,
  staffId: string | null,
  storeId?: string | null
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (!isOwner(role) && storeId) filter.storeId = storeId;

  if (isOwner(role)) return filter;
  if (!isNonOwnerStaff(role) || !staffId) return { ...filter, customer: { assignedStaffId: "__IMPOSSIBLE__" } };

  const mode = getVisibilityMode();
  if (mode === "STORE_SHARED") return filter;

  return { ...filter, customer: { assignedStaffId: staffId } };
}

/**
 * 回傳顧客直接篩選（用於 prisma.customer 查詢）
 * 自動加入 storeId 篩選（非 ADMIN）
 */
export function getManagerCustomerWhere(
  role: string,
  staffId: string | null,
  storeId?: string | null
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (!isOwner(role) && storeId) filter.storeId = storeId;

  if (isOwner(role)) return filter;
  if (!isNonOwnerStaff(role) || !staffId) return { ...filter, assignedStaffId: "__IMPOSSIBLE__" };

  const mode = getVisibilityMode();
  if (mode === "STORE_SHARED") return filter;

  return { ...filter, assignedStaffId: staffId };
}
