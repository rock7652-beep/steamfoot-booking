import { cache } from "react";
import { unstable_cache } from "next/cache";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CACHE_TAGS } from "@/lib/cache-tags";

// ============================================================
// 角色常數 & 輔助函式
// ============================================================

/** 所有「店員級」角色（不含 ADMIN / CUSTOMER） */
export const STAFF_ROLES: UserRole[] = [
  "OWNER",
  "PARTNER",
];

/** 角色中文標籤 */
export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "總部",
  OWNER: "店長",
  PARTNER: "合作店長",
  CUSTOMER: "顧客",
};

/** 可指派給員工的角色（建立/編輯員工時選擇） */
export const ASSIGNABLE_STAFF_ROLES: UserRole[] = [
  "OWNER",
  "PARTNER",
];

/** 判斷是否為 Admin */
export function isOwner(role: UserRole | string): boolean {
  return role === "ADMIN";
}

/** 判斷是否為任意員工角色（含 ADMIN） */
export function isStaffRole(role: UserRole | string): boolean {
  return role === "ADMIN" || (STAFF_ROLES as string[]).includes(role);
}

/** 判斷是否為非 Admin 的員工角色 */
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
  "transaction.void", // 取消交易 / 修改付款方式 / 修改歸屬店長（敏感操作）
  "transaction.refund", // v2 退款（建立 inverse REFUND tx + wallet 連動）
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
  // 人才管道
  "talent.read",
  "talent.manage",
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
    codes: ["transaction.read", "transaction.create", "transaction.discount", "transaction.void", "transaction.refund"],
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
  talent: {
    label: "人才管道",
    codes: ["talent.read", "talent.manage"],
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
  "transaction.void": "取消交易 / 更正付款方式 / 更正歸屬店長",
  "transaction.refund": "退款（建立負向交易並連動方案）",
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
  "talent.read": "查看人才管道",
  "talent.manage": "管理人才階段",
};

// ============================================================
// 各角色預設權限
// ============================================================

/** 店長 預設權限（接近完整營運權限） */
export const DEFAULT_OWNER_PERMISSIONS: PermissionCode[] = [
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
  "transaction.void",
  "transaction.refund",
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
  "talent.read",
  "talent.manage",
];

/** 合作店長 預設權限（日常操作，不含營收報表/系統設定/人才管理） */
export const DEFAULT_PARTNER_PERMISSIONS: PermissionCode[] = [
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
  "cashbook.read",
  "cashbook.create",
  "duty.read",
  "talent.read",
];

/** 根據角色取得預設權限列表 */
export function getDefaultPermissionsForRole(role: UserRole): PermissionCode[] {
  switch (role) {
    case "OWNER":
      return DEFAULT_OWNER_PERMISSIONS;
    case "PARTNER":
      return DEFAULT_PARTNER_PERMISSIONS;
    default:
      return [];
  }
}

// ============================================================
// 權限檢查（動態查表）
// ============================================================

/**
 * 跨請求快取的權限代碼陣列（unstable_cache 不支援 Set 序列化，故用陣列）。
 * 60s TTL，tag: "staff-permissions"。Mutation 路徑 revalidateStaffPermissions() 失效。
 */
const getStaffPermissionCodes = unstable_cache(
  async (staffId: string): Promise<PermissionCode[]> => {
    const records = await prisma.staffPermission.findMany({
      where: { staffId, granted: true },
      select: { permission: true },
    });
    return records.map((r) => r.permission as PermissionCode);
  },
  ["staff-permission-codes"],
  { revalidate: 60, tags: [CACHE_TAGS.staffPermissions] },
);

/**
 * 取得某 staff 的所有已授權權限
 * 雙層快取：
 * - 跨請求：unstable_cache（60s TTL + tag 失效）
 * - 同請求：React cache 把 array 轉成 Set 並 memoize，sidebar / 各 page guard 共用
 */
export const getStaffPermissions = cache(
  async (staffId: string): Promise<Set<PermissionCode>> => {
    const codes = await getStaffPermissionCodes(staffId);
    return new Set(codes);
  },
);

/**
 * 檢查某 staff 是否有某權限
 * Admin 永遠有所有權限。
 * 內部讀 cache 過的 getStaffPermissions Set，
 * 同一 request 內檢查 N 個權限只會打一次 DB。
 */
export async function checkPermission(
  role: UserRole,
  staffId: string | null,
  permission: PermissionCode
): Promise<boolean> {
  // Admin 永遠放行
  if (role === "ADMIN") return true;

  // Customer 不在此系統中
  if (role === "CUSTOMER") return false;

  // 所有員工角色（OWNER / PARTNER）查 StaffPermission 表
  if (!staffId) return false;

  const perms = await getStaffPermissions(staffId);
  return perms.has(permission);
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
  // ⚠ 失效跨請求 cache（tag: "staff-permissions"）由 caller 負責呼叫
  // revalidateStaffPermissions()。本檔不能 import @/lib/revalidation，
  // 否則 revalidatePath/updateTag 會被連帶拉進 middleware / client bundle，
  // 造成 build 失敗（permissions.ts 是 proxy.ts / customer error.tsx 的依賴）。
}

/**
 * 為新員工建立預設權限（根據角色）
 */
export async function createDefaultPermissions(
  staffId: string,
  role: UserRole = "OWNER"
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
// assertNotLastAdmin — 防止刪除/降級最後一位 ADMIN
// ============================================================

/**
 * 確認系統中除了指定 userId 外，還有其他 ACTIVE ADMIN。
 * 若沒有，拋出 FORBIDDEN 阻止操作。
 */
export async function assertNotLastAdmin(userId: string): Promise<void> {
  const otherAdminCount = await prisma.user.count({
    where: { role: "ADMIN", status: "ACTIVE", id: { not: userId } },
  });
  if (otherAdminCount === 0) {
    const { AppError } = await import("@/lib/errors");
    throw new AppError("FORBIDDEN", "無法移除最後一位系統管理者");
  }
}

// ============================================================
// requirePermission — 結合 session + 權限檢查
// 用於 server actions / queries，無權限時拋 FORBIDDEN
// ============================================================

export async function requirePermission(permission: PermissionCode) {
  const { requireStaffSession } = await import("@/lib/session");
  const { AppError } = await import("@/lib/errors");
  const user = await requireStaffSession();
  if (user.role === "ADMIN") return user;
  const allowed = await checkPermission(user.role, user.staffId, permission);
  if (!allowed) throw new AppError("FORBIDDEN", "您沒有此操作的權限");
  return user;
}

// ============================================================
// getUserPermissions — 取得使用者的所有已授權權限（供 layout 傳給 sidebar）
// ============================================================

export const getUserPermissions = cache(
  async (
    role: UserRole,
    staffId: string | null,
  ): Promise<PermissionCode[]> => {
    if (role === "ADMIN") return [...ALL_PERMISSIONS];
    if (!isNonOwnerStaff(role) || !staffId) return [];
    const perms = await getStaffPermissions(staffId);
    return Array.from(perms);
  },
);
