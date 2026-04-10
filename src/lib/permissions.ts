import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";

// ============================================================
// 角色常數 & 輔助函式
// ============================================================

/** 所有「店員級」角色（不含 OWNER / CUSTOMER） */
export const STAFF_ROLES: UserRole[] = [
  "STORE_MANAGER",
  "BRANCH_MANAGER",
  "INTERN_MANAGER",
  "MANAGER", // 向後相容（已棄用，等同 STORE_MANAGER）
];

/** 角色中文標籤 */
export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "系統管理者",
  STORE_MANAGER: "店長",
  BRANCH_MANAGER: "分店長",
  INTERN_MANAGER: "實習店長",
  MANAGER: "店長", // 向後相容
  CUSTOMER: "顧客",
};

/** 可指派給員工的角色（建立/編輯員工時選擇） */
export const ASSIGNABLE_STAFF_ROLES: UserRole[] = [
  "STORE_MANAGER",
  "BRANCH_MANAGER",
  "INTERN_MANAGER",
];

/** 判斷是否為 Owner */
export function isOwner(role: UserRole | string): boolean {
  return role === "OWNER";
}

/** 判斷是否為任意員工角色（含 OWNER） */
export function isStaffRole(role: UserRole | string): boolean {
  return role === "OWNER" || (STAFF_ROLES as string[]).includes(role);
}

/** 判斷是否為非 Owner 的員工角色 */
export function isNonOwnerStaff(role: UserRole | string): boolean {
  return (STAFF_ROLES as string[]).includes(role);
}

// ============================================================
// 權限代碼定義（key-value table 用）
// ============================================================

export const ALL_PERMISSIONS = [
  // 顧客
  "customer.read",
  "customer.create",
  "customer.update",
  "customer.assign",   // 指派/變更直屬店長
  "customer.export",
  // 預約
  "booking.read",
  "booking.create",
  "booking.update",
  // 交易
  "transaction.read",
  "transaction.create",
  "transaction.discount", // 使用折扣
  // 課程錢包
  "wallet.read",
  "wallet.create",
  "wallet.adjust",     // 調整剩餘堂數
  // 方案
  "plans.edit",        // 編輯方案設定
  // 營業時間
  "business_hours.view",
  "business_hours.manage",
  // 報表
  "report.read",
  "report.export",
  // 現金帳
  "cashbook.read",
  "cashbook.create",
  // 人員
  "staff.view",
  // 值班安排
  "duty.read",
  "duty.manage",
] as const;

export type PermissionCode = (typeof ALL_PERMISSIONS)[number];

// 權限分類（UI 用）
export const PERMISSION_GROUPS: Record<string, { label: string; codes: PermissionCode[] }> = {
  customer: {
    label: "顧客管理",
    codes: ["customer.read", "customer.create", "customer.update", "customer.assign", "customer.export"],
  },
  booking: {
    label: "預約管理",
    codes: ["booking.read", "booking.create", "booking.update"],
  },
  transaction: {
    label: "交易紀錄",
    codes: ["transaction.read", "transaction.create", "transaction.discount"],
  },
  wallet: {
    label: "課程方案",
    codes: ["wallet.read", "wallet.create", "wallet.adjust"],
  },
  plans: {
    label: "方案設定",
    codes: ["plans.edit"],
  },
  business_hours: {
    label: "營業時間",
    codes: ["business_hours.view", "business_hours.manage"],
  },
  report: {
    label: "報表",
    codes: ["report.read", "report.export"],
  },
  cashbook: {
    label: "現金帳",
    codes: ["cashbook.read", "cashbook.create"],
  },
  staff: {
    label: "人員管理",
    codes: ["staff.view"],
  },
  duty: {
    label: "值班安排",
    codes: ["duty.read", "duty.manage"],
  },
};

// 權限代碼 → 中文說明
export const PERMISSION_LABELS: Record<PermissionCode, string> = {
  "customer.read": "查看顧客",
  "customer.create": "新增顧客",
  "customer.update": "編輯顧客",
  "customer.assign": "指派直屬店長",
  "customer.export": "匯出顧客資料",
  "booking.read": "查看預約",
  "booking.create": "新增預約",
  "booking.update": "修改/取消預約",
  "transaction.read": "查看交易",
  "transaction.create": "新增交易",
  "transaction.discount": "使用折扣",
  "wallet.read": "查看課程方案",
  "wallet.create": "指派課程方案",
  "wallet.adjust": "調整剩餘堂數",
  "plans.edit": "編輯方案設定",
  "business_hours.view": "查看營業時間",
  "business_hours.manage": "修改營業時間",
  "report.read": "查看報表",
  "report.export": "匯出報表",
  "cashbook.read": "查看現金帳",
  "cashbook.create": "新增現金帳",
  "staff.view": "查看店員資料",
  "duty.read": "查看值班安排",
  "duty.manage": "管理值班安排",
};

// ============================================================
// 各角色預設權限
// ============================================================

/** 店長 預設權限（接近完整營運權限） */
export const DEFAULT_STORE_MANAGER_PERMISSIONS: PermissionCode[] = [
  "customer.read",
  "customer.create",
  "customer.update",
  "customer.assign",
  "customer.export",
  "booking.read",
  "booking.create",
  "booking.update",
  "transaction.read",
  "transaction.create",
  "transaction.discount",
  "wallet.read",
  "wallet.create",
  "wallet.adjust",
  "plans.edit",
  "business_hours.view",
  "business_hours.manage",
  "report.read",
  "report.export",
  "cashbook.read",
  "cashbook.create",
  "staff.view",
  "duty.read",
  "duty.manage",
];

/** 分店長 預設權限（大部分日常操作） */
export const DEFAULT_BRANCH_MANAGER_PERMISSIONS: PermissionCode[] = [
  "customer.read",
  "customer.create",
  "customer.update",
  "booking.read",
  "booking.create",
  "booking.update",
  "transaction.read",
  "transaction.create",
  "transaction.discount",
  "wallet.read",
  "wallet.create",
  "business_hours.view",
  "report.read",
  "cashbook.read",
  "cashbook.create",
  "duty.read",
];

/** 實習店長 預設權限（學習與協助） */
export const DEFAULT_INTERN_MANAGER_PERMISSIONS: PermissionCode[] = [
  "customer.read",
  "customer.create",
  "customer.update",
  "booking.read",
  "booking.create",
  "transaction.read",
  "wallet.read",
  "wallet.create",
  "business_hours.view",
  "duty.read",
];

/** 向後相容：舊版 MANAGER 預設（等同店長） */
export const DEFAULT_MANAGER_PERMISSIONS = DEFAULT_STORE_MANAGER_PERMISSIONS;

/** 根據角色取得預設權限列表 */
export function getDefaultPermissionsForRole(role: UserRole): PermissionCode[] {
  switch (role) {
    case "STORE_MANAGER":
      return DEFAULT_STORE_MANAGER_PERMISSIONS;
    case "BRANCH_MANAGER":
      return DEFAULT_BRANCH_MANAGER_PERMISSIONS;
    case "INTERN_MANAGER":
      return DEFAULT_INTERN_MANAGER_PERMISSIONS;
    case "MANAGER":
      return DEFAULT_STORE_MANAGER_PERMISSIONS; // 向後相容
    default:
      return [];
  }
}

// ============================================================
// 權限檢查（動態查表）
// ============================================================

/**
 * 檢查某 staff 是否有某權限
 * Owner 永遠有所有權限
 */
export async function checkPermission(
  role: UserRole,
  staffId: string | null,
  permission: PermissionCode
): Promise<boolean> {
  // Owner 永遠放行
  if (role === "OWNER") return true;

  // Customer 不在此系統中
  if (role === "CUSTOMER") return false;

  // 所有員工角色（STORE_MANAGER / BRANCH_MANAGER / INTERN_MANAGER / MANAGER）查 StaffPermission 表
  if (!staffId) return false;

  const record = await prisma.staffPermission.findUnique({
    where: {
      staffId_permission: {
        staffId,
        permission,
      },
    },
  });

  return record?.granted ?? false;
}

/**
 * 取得某 staff 的所有已授權權限
 */
export async function getStaffPermissions(
  staffId: string
): Promise<Set<PermissionCode>> {
  const records = await prisma.staffPermission.findMany({
    where: { staffId, granted: true },
    select: { permission: true },
  });
  return new Set(records.map((r) => r.permission as PermissionCode));
}

/**
 * 批次更新某 staff 的權限
 */
export async function updateStaffPermissions(
  staffId: string,
  permissions: Record<PermissionCode, boolean>
): Promise<void> {
  const upserts = Object.entries(permissions).map(([perm, granted]) =>
    prisma.staffPermission.upsert({
      where: {
        staffId_permission: { staffId, permission: perm },
      },
      create: { staffId, permission: perm, granted },
      update: { granted },
    })
  );

  await prisma.$transaction(upserts);
}

/**
 * 為新員工建立預設權限（根據角色）
 */
export async function createDefaultPermissions(
  staffId: string,
  role: UserRole = "STORE_MANAGER"
): Promise<void> {
  const defaults = getDefaultPermissionsForRole(role);
  const data = ALL_PERMISSIONS.map((perm) => ({
    staffId,
    permission: perm,
    granted: defaults.includes(perm),
  }));

  await prisma.staffPermission.createMany({ data, skipDuplicates: true });
}

// ============================================================
// requirePermission — 結合 session + 權限檢查
// 用於 server actions / queries，無權限時拋 FORBIDDEN
// ============================================================

export async function requirePermission(permission: PermissionCode) {
  const { requireStaffSession } = await import("@/lib/session");
  const { AppError } = await import("@/lib/errors");
  const user = await requireStaffSession();
  if (user.role === "OWNER") return user;
  const allowed = await checkPermission(user.role, user.staffId, permission);
  if (!allowed) throw new AppError("FORBIDDEN", "您沒有此操作的權限");
  return user;
}

// ============================================================
// getUserPermissions — 取得使用者的所有已授權權限（供 layout 傳給 sidebar）
// ============================================================

export async function getUserPermissions(
  role: UserRole,
  staffId: string | null
): Promise<PermissionCode[]> {
  if (role === "OWNER") return [...ALL_PERMISSIONS];
  if (!isNonOwnerStaff(role) || !staffId) return [];
  const perms = await getStaffPermissions(staffId);
  return Array.from(perms);
}

// ============================================================
// 便捷函數（向後相容 — 已重新匯出到頂部）
// ============================================================

/** @deprecated 使用 isStaffRole() 代替 */
export function isStaff(role: UserRole): boolean {
  return isStaffRole(role);
}
