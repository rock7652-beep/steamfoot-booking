"use server";

import { z } from "zod";
import { hashSync } from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { AppError, handleActionError } from "@/lib/errors";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import {
  createDefaultPermissions,
  checkPermission,
  assertNotLastStoreManager,
  updateStaffPermissions,
  type PermissionCode,
} from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { revalidateStaff, revalidateStaffPermissions } from "@/lib/revalidation";
import type { UserRole } from "@prisma/client";
import type { ActionResult } from "@/types";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { isSpaDemoStoreId } from "@/lib/spa-demo-store";
import { isSpaCompensationSchemaReady, isSpaOperationalSchemaReady } from "@/lib/spa-schema-readiness";

const spaSkillKeys = ["body", "head", "foot", "face"] as const;
const spaTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 要求可管理人員的身份：OWNER（店長）或 ADMIN（系統管理者，需已選定分店）。
 * PARTNER / CUSTOMER 一律拒絕。
 */
async function requireStaffManageSession() {
  const user = await requireStaffSession();
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "此功能僅限店長或系統管理者使用");
  }
  return user;
}

/**
 * PR-3 帳號管理階層守則（server 端，非僅 UI）。
 * 套用於：編輯權限 / 改 role / 停用 / 啟用 等「管理他人帳號」操作。
 *
 * - ADMIN（rock7652）：最高權限，可穿透 isOwner，管理所有分店 staff（pass/ggg）
 * - 非 ADMIN：必須具 staff.manage（→ pass 有、ggg 無），且
 *     · 不可管理 ADMIN 目標
 *     · 不可管理 isOwner=true 的主要店長（pass）
 * - 任何人不可對「自己」執行此類操作（防自鎖：停用自己 / 改自己 role /
 *   移除自己 staff.manage）。
 */
async function assertCanManageStaff(
  sessionUser: { id: string; role: UserRole; staffId: string | null },
  targetStaff: {
    userId: string;
    isOwner: boolean;
    user: { role: UserRole };
  },
): Promise<void> {
  const isAdmin = sessionUser.role === "ADMIN";

  // self-guard：不可管理自己（含 ADMIN-with-staff 的防呆）→ 防自鎖
  if (targetStaff.userId === sessionUser.id) {
    throw new AppError(
      "FORBIDDEN",
      "無法對自己的帳號執行此操作，請由其他管理者處理",
    );
  }

  if (isAdmin) return; // ADMIN 最高權限：穿透 isOwner、可管理所有分店 staff

  // 非 ADMIN：需具 staff.manage（ggg/合作店長無 → 全擋）
  const ok = await checkPermission(
    sessionUser.role,
    sessionUser.staffId,
    "staff.manage",
  );
  if (!ok) throw new AppError("FORBIDDEN", "您沒有店員管理權限");

  // 非 ADMIN 不可管理 ADMIN 目標
  if (targetStaff.user.role === "ADMIN") {
    throw new AppError("FORBIDDEN", "無權管理系統管理者帳號");
  }
  // 非 ADMIN 不可管理 isOwner=true 的主要店長
  if (targetStaff.isOwner) {
    throw new AppError("FORBIDDEN", "無權管理主要店長帳號");
  }
}

// ============================================================
// Schemas
// ============================================================

const createStaffSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().email().optional(),
  ),
  phone: z.string().transform(normalizePhone).pipe(
    z.string().regex(/^09\d{8}$/, "請輸入 09 開頭的 10 碼手機號碼"),
  ),
  password: z.string().min(6),
  displayName: z.string().min(1).max(100),
  colorCode: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  monthlySpaceFee: z.number().int().min(0).optional(),
  spaceFeeEnabled: z.boolean().optional(),
  role: z.enum(["OWNER", "PARTNER"]).optional(),
  spaCompensation: z.object({
    mode: z.enum(["PERCENTAGE", "FIXED"]),
    value: z.number().min(0).max(1_000_000),
  }).optional(),
  spaSkillKeys: z.array(z.enum(spaSkillKeys)).min(1).optional(),
  spaWeeklyAvailability: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(spaTimePattern),
    endTime: z.string().regex(spaTimePattern),
  })).max(7).optional(),
}).superRefine((data, context) => {
  if (data.spaCompensation?.mode === "PERCENTAGE" && data.spaCompensation.value > 100) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["spaCompensation", "value"], message: "百分比不可超過 100" });
  }
  if (data.spaWeeklyAvailability) {
    if (new Set(data.spaWeeklyAvailability.map((item) => item.dayOfWeek)).size !== data.spaWeeklyAvailability.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["spaWeeklyAvailability"], message: "同一天只能設定一個固定班表" });
    }
    if (data.spaWeeklyAvailability.some((item) => item.startTime >= item.endTime)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["spaWeeklyAvailability"], message: "結束時間必須晚於開始時間" });
    }
  }
});

const updateStaffSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  colorCode: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  monthlySpaceFee: z.number().int().min(0).optional(),
  spaceFeeEnabled: z.boolean().optional(),
  role: z.enum(["OWNER", "PARTNER"]).optional(),
});

const resetStaffPasswordSchema = z.object({
  userId: z.string().min(1),
  newPassword: z.string().min(8, "新密碼至少需要 8 碼"),
});

// ============================================================
// createStaff — Owner only
// ============================================================

export async function createStaff(
  input: z.infer<typeof createStaffSchema>
): Promise<ActionResult<{ staffId: string }>> {
  try {
    const sessionUser = await requireStaffManageSession();
    const data = createStaffSchema.parse(input);
    const writeStoreId = await resolveWriteStoreId(sessionUser);
    const hasSpaSetup = Boolean(data.spaCompensation || data.spaSkillKeys || data.spaWeeklyAvailability);
    if (hasSpaSetup && !isSpaDemoStoreId(writeStoreId)) {
      throw new AppError("FORBIDDEN", "SPA 人員設定不可寫入其他門市");
    }
    if (hasSpaSetup && !(await isSpaOperationalSchemaReady())) {
      throw new AppError("CONFLICT", "SPA 人員設定功能更新中，請稍後再試");
    }
    if (data.spaCompensation && !(await isSpaCompensationSchemaReady())) {
      throw new AppError("CONFLICT", "抽成設定功能更新中，請稍後再試");
    }
    await requireStoreFeature(writeStoreId, FEATURES.STAFF_MANAGEMENT);

    const normalizedEmail = data.email ? normalizeEmail(data.email) : undefined;

    // 用量限制：檢查員工數量上限
    const { checkStaffLimitOrThrow } = await import("@/lib/usage-gate");
    const currentStaffCount = await prisma.staff.count({
      where: { storeId: writeStoreId, status: "ACTIVE" },
    });
    await checkStaffLimitOrThrow(currentStaffCount);

    // 檢查 email 是否已存在
    if (normalizedEmail) {
      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing) throw new AppError("CONFLICT", "此 Email 已被使用");
    }
    const existingPhone = await prisma.user.findFirst({
      where: { phone: data.phone, role: data.role ?? "PARTNER" },
      select: { id: true },
    });
    if (existingPhone) throw new AppError("CONFLICT", "此手機號碼已建立相同身分的帳號");

    const passwordHash = hashSync(data.password, 10);
    const staffRole: UserRole = data.role ?? "OWNER";

    const user = await prisma.$transaction(async (tx) => {
      if (data.spaSkillKeys) {
        const skillIds = data.spaSkillKeys.map((key) => `spa-demo-skill-${key}`);
        const matchingSkills = await tx.professionalSkill.count({
          where: { id: { in: skillIds }, storeId: writeStoreId, isActive: true },
        });
        if (matchingSkills !== skillIds.length) {
          throw new AppError("CONFLICT", "部分專業項目尚未建立，請重新整理後再試");
        }
      }

      const created = await tx.user.create({
        data: {
          name: data.name,
          email: normalizedEmail,
          phone: data.phone,
          passwordHash,
          role: staffRole,
          staff: {
            create: {
              displayName: data.displayName,
              colorCode: data.colorCode ?? "#6366f1",
              isOwner: false,
              monthlySpaceFee: data.monthlySpaceFee ?? 0,
              spaceFeeEnabled: data.spaceFeeEnabled ?? true,
              storeId: writeStoreId,
              ...(data.spaCompensation ? {
                spaCompensationSetting: {
                  create: {
                    store: { connect: { id: writeStoreId } },
                    mode: data.spaCompensation.mode,
                    value: data.spaCompensation.value,
                  },
                },
              } : {}),
            },
          },
        },
        include: { staff: true },
      });
      if (created.staff && data.spaSkillKeys) {
        await tx.staffSkill.createMany({
          data: data.spaSkillKeys.map((key) => ({
            storeId: writeStoreId,
            staffId: created.staff!.id,
            skillId: `spa-demo-skill-${key}`,
          })),
        });
      }
      if (created.staff && data.spaWeeklyAvailability?.length) {
        await tx.staffWeeklyAvailability.createMany({
          data: data.spaWeeklyAvailability.map((availability) => ({
            ...availability,
            storeId: writeStoreId,
            staffId: created.staff!.id,
          })),
        });
      }
      return created;
    });

    // 根據角色建立預設權限
    if (user.staff) {
      await createDefaultPermissions(user.staff.id, staffRole);
    }

    revalidateStaff();
    return { success: true, data: { staffId: user.staff!.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// updateStaff — Owner only
// ============================================================

export async function updateStaff(
  staffId: string,
  input: z.infer<typeof updateStaffSchema>
): Promise<ActionResult<void>> {
  try {
    const sessionUser = await requireStaffManageSession();
    const data = updateStaffSchema.parse(input);
    const writeStoreId = await resolveWriteStoreId(sessionUser);

    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      include: { user: { select: { id: true, role: true } } },
    });
    if (!staff) throw new AppError("NOT_FOUND", "員工不存在");
    if (staff.storeId !== writeStoreId) {
      throw new AppError("FORBIDDEN", "無權存取其他店舖的員工資料");
    }
    await assertCanManageStaff(sessionUser, {
      userId: staff.userId,
      isOwner: staff.isOwner,
      user: { role: staff.user.role },
    });

    // 更新 Staff 基本資料
    const { role: newRole, ...staffData } = data;
    await prisma.staff.update({
      where: { id: staffId, storeId: writeStoreId },
      data: staffData,
    });

    // 如果角色變更，同步更新 User.role
    if (newRole) {
      // 防呆：不允許降級最後一位 ADMIN
      const currentUser = await prisma.user.findUnique({
        where: { id: staff.user.id },
        select: { role: true },
      });
      if (currentUser?.role === "ADMIN") {
        const { assertNotLastAdmin } = await import("@/lib/permissions");
        await assertNotLastAdmin(staff.user.id);
      }
      await prisma.user.update({
        where: { id: staff.user.id },
        data: { role: newRole },
      });
    }

    revalidateStaff();
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// deactivateStaff — Owner only
// ============================================================

export async function deactivateStaff(staffId: string): Promise<ActionResult<void>> {
  try {
    const sessionUser = await requireStaffManageSession();
    const writeStoreId = await resolveWriteStoreId(sessionUser);

    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      include: { user: { select: { role: true } } },
    });
    if (!staff) throw new AppError("NOT_FOUND", "員工不存在");
    if (staff.storeId !== writeStoreId) {
      throw new AppError("FORBIDDEN", "無權存取其他店舖的員工資料");
    }
    await assertCanManageStaff(sessionUser, {
      userId: staff.userId,
      isOwner: staff.isOwner,
      user: { role: staff.user.role },
    });
    // 最小防呆：停用後該店不可無人可管理（無 active ADMIN 時才擋）
    await assertNotLastStoreManager(staff.storeId, staff.id);

    await prisma.$transaction([
      prisma.staff.update({ where: { id: staffId, storeId: writeStoreId }, data: { status: "INACTIVE" } }),
      prisma.user.update({ where: { id: staff.userId }, data: { status: "SUSPENDED" } }),
    ]);

    revalidateStaff();
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// resetStaffPasswordAction — 店長 / ADMIN 可替他人重設密碼
// ============================================================

export async function resetStaffPasswordAction(
  input: z.infer<typeof resetStaffPasswordSchema>
): Promise<ActionResult<void>> {
  try {
    const sessionUser = await requireStaffManageSession();
    const data = resetStaffPasswordSchema.parse(input);

    // 禁止自己重設自己（走個人設定頁）
    if (data.userId === sessionUser.id) {
      throw new AppError("FORBIDDEN", "請由個人設定頁修改自己的密碼");
    }

    const writeStoreId = await resolveWriteStoreId(sessionUser);

    // 透過 staff 表驗證目標使用者屬於當前寫入 store
    const targetStaff = await prisma.staff.findFirst({
      where: { userId: data.userId, storeId: writeStoreId },
      include: { user: { select: { id: true, role: true } } },
    });
    if (!targetStaff) throw new AppError("NOT_FOUND", "員工不存在");
    if (targetStaff.isOwner) {
      throw new AppError("FORBIDDEN", "無法重設系統管理者帳號");
    }

    const targetRole = targetStaff.user.role;

    // ADMIN 身份目標一律拒絕（系統管理者不應透過此流程）
    if (targetRole === "ADMIN") {
      throw new AppError("FORBIDDEN", "無法重設系統管理者帳號");
    }

    // OWNER 僅能重設 PARTNER；不得重設其他 OWNER
    if (sessionUser.role === "OWNER" && targetRole !== "PARTNER") {
      throw new AppError("FORBIDDEN", "店長僅可重設合作店長 / 員工帳號的密碼");
    }

    const passwordHash = hashSync(data.newPassword, 10);
    await prisma.user.update({
      where: { id: data.userId },
      data: { passwordHash },
    });

    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// activateStaff — Owner only
// ============================================================

export async function activateStaff(staffId: string): Promise<ActionResult<void>> {
  try {
    const sessionUser = await requireStaffManageSession();
    const writeStoreId = await resolveWriteStoreId(sessionUser);

    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      include: { user: { select: { role: true } } },
    });
    if (!staff) throw new AppError("NOT_FOUND", "員工不存在");
    if (staff.storeId !== writeStoreId) {
      throw new AppError("FORBIDDEN", "無權存取其他店舖的員工資料");
    }
    await assertCanManageStaff(sessionUser, {
      userId: staff.userId,
      isOwner: staff.isOwner,
      user: { role: staff.user.role },
    });

    await prisma.$transaction([
      prisma.staff.update({ where: { id: staffId, storeId: writeStoreId }, data: { status: "ACTIVE" } }),
      prisma.user.update({ where: { id: staff.userId }, data: { status: "ACTIVE" } }),
    ]);

    revalidateStaff();
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// updateStaffPermissionsAction — PR-3
// 編輯店員權限的「有守門」入口。取代編輯頁直呼 updateStaffPermissions
// （原本 server 端零守門）。同階層規則：staff.manage + 非 ADMIN 不可管
// ADMIN/主要店長 + 不可改自己（含不可移除自己 staff.manage 自鎖）。
// ============================================================
export async function updateStaffPermissionsAction(
  staffId: string,
  permissions: Record<PermissionCode, boolean>,
): Promise<ActionResult<void>> {
  try {
    const sessionUser = await requireStaffManageSession();
    const writeStoreId = await resolveWriteStoreId(sessionUser);

    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      include: { user: { select: { role: true } } },
    });
    if (!staff) throw new AppError("NOT_FOUND", "員工不存在");
    if (staff.storeId !== writeStoreId) {
      throw new AppError("FORBIDDEN", "無權存取其他店舖的員工資料");
    }
    await assertCanManageStaff(sessionUser, {
      userId: staff.userId,
      isOwner: staff.isOwner,
      user: { role: staff.user.role },
    });

    await updateStaffPermissions(staffId, permissions);
    revalidateStaffPermissions();
    revalidateStaff();
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
