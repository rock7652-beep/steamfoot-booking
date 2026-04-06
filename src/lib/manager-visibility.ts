/**
 * Manager 可視範圍（Visibility Mode）
 *
 * 控制 Manager 在各功能模組中能看到多少資料。
 *
 * 模式定義：
 * - SELF_ONLY: 只看到自己名下的資料（目前預設行為）
 * - STORE_SHARED: 可以看到全店資料（只讀），但仍只能操作自己名下的
 *
 * 設計決策：
 * 1. 用 env var 控制全域預設（`MANAGER_VISIBILITY_MODE`）
 * 2. 未來可擴展為 per-staff 設定（在 StaffPermission 加一筆 `visibility.mode`）
 * 3. 寫入操作（create/update/delete）不受此設定影響，始終只能操作自己名下
 *
 * 篩選類型對照：
 * - assignedStaffId: 顧客歸屬 → 影響 booking、customer 查詢
 * - revenueStaffId: 營收歸屬 → 影響 transaction、report 查詢
 * - staffId: 操作者 → 影響 cashbook 查詢
 */

export type VisibilityMode = "SELF_ONLY" | "STORE_SHARED";

/**
 * 取得當前生效的 Manager 可視範圍模式
 *
 * 優先順序：
 * 1. 環境變數 MANAGER_VISIBILITY_MODE
 * 2. 預設 SELF_ONLY（向後相容）
 */
export function getVisibilityMode(): VisibilityMode {
  const envMode = process.env.MANAGER_VISIBILITY_MODE;
  if (envMode === "STORE_SHARED") return "STORE_SHARED";
  return "SELF_ONLY";
}

/**
 * 根據可視範圍回傳 Manager 查詢篩選條件
 *
 * 使用方式：
 * ```ts
 * const filter = getManagerReadFilter(user.role, user.staffId, "assignedStaffId");
 * const bookings = await prisma.booking.findMany({ where: { ...filter, ... } });
 * ```
 *
 * @param role - 使用者角色
 * @param staffId - 使用者 staffId
 * @param filterField - 篩選欄位名（如 "assignedStaffId"、"revenueStaffId"、"staffId"）
 * @returns Prisma where 條件物件（空物件 = 不篩選）
 */
export function getManagerReadFilter(
  role: string,
  staffId: string | null,
  filterField: "assignedStaffId" | "revenueStaffId" | "staffId"
): Record<string, unknown> {
  // Owner 不篩選
  if (role === "OWNER") return {};

  // 非 Manager 或沒有 staffId → 空結果（安全預設）
  if (role !== "MANAGER" || !staffId) return { [filterField]: "__IMPOSSIBLE__" };

  const mode = getVisibilityMode();

  if (mode === "STORE_SHARED") {
    // 全店可見 → 不加篩選
    return {};
  }

  // SELF_ONLY → 只看自己
  return { [filterField]: staffId };
}

/**
 * 回傳巢狀 customer 篩選（用於 booking 查詢中透過 customer.assignedStaffId 篩選）
 *
 * 使用方式：
 * ```ts
 * const customerFilter = getManagerCustomerFilter(user.role, user.staffId);
 * const bookings = await prisma.booking.findMany({
 *   where: { ...customerFilter, ... },
 * });
 * ```
 */
export function getManagerCustomerFilter(
  role: string,
  staffId: string | null
): Record<string, unknown> {
  if (role === "OWNER") return {};
  if (role !== "MANAGER" || !staffId) return { customer: { assignedStaffId: "__IMPOSSIBLE__" } };

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
  if (role === "OWNER") return {};
  if (role !== "MANAGER" || !staffId) return { assignedStaffId: "__IMPOSSIBLE__" };

  const mode = getVisibilityMode();
  if (mode === "STORE_SHARED") return {};

  return { assignedStaffId: staffId };
}
