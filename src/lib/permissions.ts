import { cache } from "react";
import { unstable_cache } from "next/cache";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { SPA_DEMO_OWNER_STAFF_ID } from "@/lib/spa-demo-store";

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
  "customer.identity.rebind", // 店長核准式 LINE 重新綁定（捕捉/執行分離）
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
  // 現金抽屜
  "cashDrawer.read",
  "cashDrawer.open",
  "cashDrawer.close",
  "cashDrawer.entry", // 提領 / 補入 / 調整
  // 人員
  "staff.view",
  "staff.manage", // 管理店員與權限（編輯權限 / 停用·啟用 / 改 role）— PR-3
  // 值班安排
  "duty.read",
  "duty.manage",
  // 人才管道
  "talent.read",
  "talent.manage",
  // 體驗單
  "trial.read",
  "trial.create",
  "trial.confirm", // 確認收款（開通堂數 / 計營收）
  "trial.cancel",  // 取消體驗 / 退款取消
  "trial.manage",  // 體驗課設定
] as const;

export type PermissionCode = (typeof ALL_PERMISSIONS)[number];

// 權限分類（UI 用）
export const PERMISSION_GROUPS: Record<string, { label: string; codes: PermissionCode[] }> = {
  customer: {
    label: "顧客管理",
    codes: ["customer.read", "customer.create", "customer.update", "customer.assign", "customer.export", "customer.identity.rebind"],
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
  cashDrawer: {
    label: "現金抽屜",
    codes: ["cashDrawer.read", "cashDrawer.open", "cashDrawer.close", "cashDrawer.entry"],
  },
  staff: {
    label: "人員管理",
    codes: ["staff.view", "staff.manage"],
  },
  duty: {
    label: "值班安排",
    codes: ["duty.read", "duty.manage"],
  },
  talent: {
    label: "人才管道",
    codes: ["talent.read", "talent.manage"],
  },
  trial: {
    label: "體驗單",
    codes: ["trial.read", "trial.create", "trial.confirm", "trial.cancel", "trial.manage"],
  },
};

// 權限代碼 → 中文說明
export const PERMISSION_LABELS: Record<PermissionCode, string> = {
  "customer.read": "查看顧客",
  "customer.create": "新增顧客",
  "customer.update": "編輯顧客",
  "customer.assign": "指派直屬店長",
  "customer.export": "匯出顧客資料",
  "customer.identity.rebind": "管理 LINE 重新綁定申請",
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
  "cashDrawer.read": "查看現金抽屜",
  "cashDrawer.open": "開店點錢",
  "cashDrawer.close": "閉店點錢",
  "cashDrawer.entry": "現金抽屜異動（提領 / 補入 / 調整）",
  "staff.view": "查看店員資料",
  "staff.manage": "管理店員與權限",
  "duty.read": "查看值班安排",
  "duty.manage": "管理值班安排",
  "talent.read": "查看人才管道",
  "talent.manage": "管理人才階段",
  "trial.read": "查看體驗單",
  "trial.create": "建立體驗單",
  "trial.confirm": "確認體驗收款",
  "trial.cancel": "取消體驗 / 退款取消",
  "trial.manage": "管理體驗課設定",
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
  "customer.identity.rebind",
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
  "cashDrawer.read",
  "cashDrawer.open",
  "cashDrawer.close",
  "cashDrawer.entry",
  "staff.view",
  // staff.manage 刻意「不」放入 OWNER 預設：只有 ADMIN（role 自動最高）
  // 能管理店長帳號。未來若要開給特定分店管理者，由 ADMIN 在編輯頁手動授權。
  "duty.read",
  "duty.manage",
  "talent.read",
  "talent.manage",
  "trial.read",
  "trial.create",
  "trial.confirm",
  "trial.cancel",
  "trial.manage",
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
  "cashDrawer.read",
  "duty.read",
  "talent.read",
  "trial.read",
  "trial.create",
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
  async (staffId: string, authorizedStoreId?: string): Promise<Set<PermissionCode>> => {
    if (authorizedStoreId) {
      const staff = await prisma.staff.findFirst({
        where: { id: staffId, storeId: authorizedStoreId },
        select: { id: true },
      });
      if (!staff) {
        const { AppError } = await import("@/lib/errors");
        throw new AppError("NOT_FOUND", "員工不存在");
      }
    }
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

  // SPA Demo 店長是隔離的展示帳號，需能走完所有後台示範流程。
  // 僅比對固定 staff id，不會擴及任何正式門市或其他 OWNER。
  if (staffId === SPA_DEMO_OWNER_STAFF_ID) return true;

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

/**
 * PR-3 最小防呆：避免某店「最後一位可管理者」被停用 / 失去 staff.manage
 * 而導致無人能管理該店。
 *
 * 可管理者 = 該店 ACTIVE staff 且（isOwner=true 或 granted staff.manage）。
 * 設計取捨（保持最小、不過度防呆）：只要系統仍有 ACTIVE ADMIN，
 * ADMIN 為跨店最終救援者 → 不擋（呼應「ADMIN 仍是最終救援者」）。
 * 僅在「無 ACTIVE ADMIN 且該店扣掉此人後再無可管理者」時擋下。
 */
export async function assertNotLastStoreManager(
  storeId: string,
  excludingStaffId: string,
): Promise<void> {
  const activeAdmin = await prisma.user.count({
    where: { role: "ADMIN", status: "ACTIVE" },
  });
  if (activeAdmin > 0) return; // ADMIN 永遠可救 → 不過度防呆

  const others = await prisma.staff.findMany({
    where: { storeId, status: "ACTIVE", id: { not: excludingStaffId } },
    select: {
      isOwner: true,
      permissions: {
        where: { permission: "staff.manage", granted: true },
        select: { id: true },
      },
    },
  });
  const stillManageable = others.some(
    (s) => s.isOwner || s.permissions.length > 0,
  );
  if (!stillManageable) {
    const { AppError } = await import("@/lib/errors");
    throw new AppError("FORBIDDEN", "無法停用最後一位可管理本店的人");
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

/**
 * PR-1 Store Organization foundation.
 *
 * This guard is intentionally not wired into existing actions yet. Future PRs
 * should replace write paths with this helper after view-mode context is fully
 * connected. With no options, it resolves to the user's own store and preserves
 * current behavior.
 */
export async function requireWritablePermission(
  permission: PermissionCode,
  options?: { viewedStoreId?: string | null },
) {
  const user = await requirePermission(permission);
  if (user.role === "ADMIN") return user;

  let viewOptions = options;
  if (viewOptions === undefined) {
    const { cookies } = await import("next/headers");
    const { VIEWED_STORE_COOKIE_NAME } = await import(
      "@/lib/store-view-mode-constants"
    );
    const cookieStore = await cookies();
    viewOptions = {
      viewedStoreId: cookieStore.get(VIEWED_STORE_COOKIE_NAME)?.value ?? null,
    };
  }

  const { resolveStoreViewContext, assertWritableStoreViewContext } =
    await import("@/lib/store-organization");
  const ctx = await resolveStoreViewContext(user, viewOptions);
  assertWritableStoreViewContext(ctx);
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
