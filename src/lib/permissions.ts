import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";

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
  // 課程錢包
  "wallet.read",
  "wallet.create",
  // 報表
  "report.read",
  "report.export",
  // 現金帳
  "cashbook.read",
  "cashbook.create",
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
    codes: ["transaction.read", "transaction.create"],
  },
  wallet: {
    label: "課程方案",
    codes: ["wallet.read", "wallet.create"],
  },
  report: {
    label: "報表",
    codes: ["report.read", "report.export"],
  },
  cashbook: {
    label: "現金帳",
    codes: ["cashbook.read", "cashbook.create"],
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
  "wallet.read": "查看課程方案",
  "wallet.create": "指派課程方案",
  "report.read": "查看報表",
  "report.export": "匯出報表",
  "cashbook.read": "查看現金帳",
  "cashbook.create": "新增現金帳",
};

// 新建 Manager 時的預設權限
export const DEFAULT_MANAGER_PERMISSIONS: PermissionCode[] = [
  "customer.read",
  "customer.create",
  "booking.read",
  "booking.create",
  "booking.update",
  "transaction.read",
  "transaction.create",
  "wallet.read",
];

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

  // Manager 查 StaffPermission 表
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
 * 為新 Manager 建立預設權限
 */
export async function createDefaultPermissions(staffId: string): Promise<void> {
  const data = ALL_PERMISSIONS.map((perm) => ({
    staffId,
    permission: perm,
    granted: DEFAULT_MANAGER_PERMISSIONS.includes(perm),
  }));

  await prisma.staffPermission.createMany({ data, skipDuplicates: true });
}

// ============================================================
// 便捷函數（向後相容）
// ============================================================

export function isOwner(role: UserRole): boolean {
  return role === "OWNER";
}

export function isStaff(role: UserRole): boolean {
  return role === "OWNER" || role === "MANAGER";
}
