/**
 * booking-helpers — 純函式 helpers，從 booking.ts 抽出便於 vitest 直接 import
 *
 * 為什麼分檔：booking.ts 有 `"use server"` directive，會把 next-auth /
 * session 等 side-effect 拉進測試環境，導致純邏輯測試無法跑。本檔不引入
 * 任何 server-only 依賴，可被任意 client / test context 安全 import。
 */

/**
 * snapshotRevenueStaffForBooking — Booking.revenueStaffId 快照規則（PR-1.5a 鎖定）
 *
 * 規則：
 *   - 快照來源**只能**是 `customer.assignedStaffId`（operator 透過顧客 drawer
 *     或批次指派 UI 明確設定的直屬店長）。
 *   - `customer.assignedStaffId = null` → `revenueStaffId = null`，代表「歸店家」。
 *     **不假裝補一位店長**讓數字看起來漂亮。
 *
 * 禁止：
 *   - 不可用 `resolveCustomerStaffAssignment` 在這裡做 referral / sponsor /
 *     store_owner fallback。owner fallback 會把沒指派的顧客自動歸給 owner，
 *     繞過 operator 的批次指派 UI，等於 silent assignment。
 *   - 不可在 booking 建立流程中順手 update Customer.assignedStaffId
 *     （resolver 的 `persist: true` 副作用）。booking 是「快照」不該影響
 *     被快照的顧客資料。
 *
 * 若 prod 上發現顧客 assignedStaffId 大量為 null：用顧客 drawer / 批次指派
 *   UI 補（PR #122 已上線）。歷史 booking 缺 revenueStaffId 要走 backfill
 *   dry-run 流程（PR-1.5b），由 operator 明確 review 後才寫入。
 *
 * 對應規格：docs/staff-settlement-phase1-spec.md §3.4
 */
export function snapshotRevenueStaffForBooking(
  customerAssignedStaffId: string | null,
): string | null {
  return customerAssignedStaffId ?? null;
}
