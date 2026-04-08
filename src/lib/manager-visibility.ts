/**
 * Manager 可視範圍（Visibility Mode）
 *
 * 控制非 Owner 員工在各功能模組中能看到多少資料。
 *
 * 模式定義：
 * - SELF_ONLY: 只看到自己名下的資料（目前預設行為）
 * - STORE_SHARED: 可以看到全店資料（只讀），但仍只能操作自己名下的
 */

import { isOwner, isNonOwnerStaff } from "@/lib/permissions";

export type VisibilityMode = "SELF_ONLY" | "STORE_SHARED";

/**
 * 取得當前生效的 Manager 可視範圍模式
 */
export function getVisibilityMode(): VisibilityMode {
  const envMode = process.env.MANAGER_VISIBILITY_MODE;
  if (envMode === "STORE_SHARED") return "STORE_SHARED";
  return "SELF_ONLY";
}

/**
 * 根據可視範圍回傳員工查詢篩選條件
 */
export function getManagerReadFilter(
  role: string,
  staffId: string | null,
  filterField: "assignedStaffId" | "revenueStaffId" | "staffId"
): Record<string, unknown> {
  // Owner 不篩選
  if (isOwner(role)) return {};

  // 非員工或沒有 staffId → 空結果（安全預設）
  if (!isNonOwnerStaff(role) || !staffId) return { [filterField]: "__IMPOSSIBLE__" };

  const mode = getVisibilityMode();

  if (mode === "STORE_SHARED") {
    return {};
  }

  // SELF_ONLY → 只看自己
  return { [filterField]: staffId };
}

/**
 * 回傳巢狀 customer 篩選（用於 booking 查詢中透過 customer.assignedStaffId 篩選）
 */
export function getManagerCustomerFilter(
  role: string,
  staffId: string | null
): Record<string, unknown> {
  if (isOwner(role)) return {};
  if (!isNonOwnerStaff(role) || !staffId) return { customer: { assignedStaffId: "__IMPOSSIBLE__" } };

  const mode = getVisibilityMode();
  if (mode === "STORE_SHARED") return {};

  return { customer: { assignedStaffId: staffId } };
}

/**
 * 回傳顧客直接篩選（用於 prisma.customer 查詢）
 */
export function getManagerCustomerWhere(
  role: string,
  staffId: string | null
): Record<string, unknown> {
  if (isOwner(role)) return {};
  if (!isNonOwnerStaff(role) || !staffId) return { assignedStaffId: "__IMPOSSIBLE__" };

  const mode = getVisibilityMode();
  if (mode === "STORE_SHARED") return {};

  return { assignedStaffId: staffId };
}
