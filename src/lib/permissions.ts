import { UserRole } from "@prisma/client";

// ============================================================
// RBAC 權限定義
// ============================================================

/**
 * 資源 (Resource) 定義
 */
export type Resource =
  | "staff"
  | "customer"
  | "booking"
  | "service_plan"
  | "wallet"
  | "transaction"
  | "cashbook"
  | "report"
  | "reminder"
  | "space_fee"
  | "audit_log"
  | "settings";

/**
 * 操作 (Action) 定義
 */
export type Action =
  | "create"
  | "read"
  | "read_own"
  | "update"
  | "update_own"
  | "delete"
  | "list"
  | "list_own"
  | "transfer"
  | "manage";

/**
 * 權限矩陣
 *
 * Owner: 全部資源完全存取
 * Manager: 只能存取自己名下的顧客/預約/交易
 * Customer: 只能看自己的資料，且需購課後才能預約
 */
const PERMISSIONS: Record<UserRole, Partial<Record<Resource, Action[]>>> = {
  OWNER: {
    staff: ["create", "read", "update", "delete", "list", "manage"],
    customer: ["create", "read", "update", "delete", "list", "transfer"],
    booking: ["create", "read", "update", "delete", "list"],
    service_plan: ["create", "read", "update", "delete", "list", "manage"],
    wallet: ["create", "read", "update", "list"],
    transaction: ["create", "read", "list"],
    cashbook: ["create", "read", "update", "delete", "list"],
    report: ["read", "list"],
    reminder: ["create", "read", "list", "manage"],
    space_fee: ["create", "read", "update", "list", "manage"],
    audit_log: ["read", "list"],
    settings: ["read", "update", "manage"],
  },
  MANAGER: {
    customer: ["create", "read_own", "update_own", "list_own"],
    booking: ["create", "read_own", "update_own", "list_own"],
    service_plan: ["read", "list"],
    wallet: ["create", "read_own", "list_own"],
    transaction: ["create", "read_own", "list_own"],
    cashbook: ["read_own", "list_own"],
    report: ["read_own"],
  },
  CUSTOMER: {
    booking: ["create", "read_own", "list_own"],
    wallet: ["read_own", "list_own"],
    transaction: ["read_own", "list_own"],
  },
};

/**
 * 檢查角色是否有某資源的某操作權限
 */
export function hasPermission(
  role: UserRole,
  resource: Resource,
  action: Action
): boolean {
  const rolePerms = PERMISSIONS[role];
  if (!rolePerms) return false;
  const actions = rolePerms[resource];
  if (!actions) return false;
  return actions.includes(action);
}

/**
 * 檢查 Manager 是否只能存取自己名下資料
 * 若權限是 read_own / update_own / list_own，回傳 true
 */
export function isOwnOnly(role: UserRole, resource: Resource): boolean {
  const rolePerms = PERMISSIONS[role];
  if (!rolePerms) return true;
  const actions = rolePerms[resource];
  if (!actions) return true;
  // 如果有完整的 read/list/update，就不是 own-only
  const hasFullAccess = actions.some(
    (a) => a === "read" || a === "list" || a === "update"
  );
  return !hasFullAccess;
}

/**
 * 取得角色對某資源的所有允許操作
 */
export function getPermissions(
  role: UserRole,
  resource: Resource
): Action[] {
  return PERMISSIONS[role]?.[resource] ?? [];
}

/**
 * 確認是否為 Owner
 */
export function isOwner(role: UserRole): boolean {
  return role === "OWNER";
}

/**
 * 確認是否為 Staff（Owner 或 Manager）
 */
export function isStaff(role: UserRole): boolean {
  return role === "OWNER" || role === "MANAGER";
}
