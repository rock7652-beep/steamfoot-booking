"use server";

import { z } from "zod";
import { hashSync } from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { AppError, handleActionError } from "@/lib/errors";
import { checkCurrentStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { createDefaultPermissions } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { revalidateStaff } from "@/lib/revalidation";
import type { UserRole } from "@prisma/client";
import type { ActionResult } from "@/types";

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

// ============================================================
// Schemas
// ============================================================

const createStaffSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().min(8).max(20).optional(),
  password: z.string().min(6),
  displayName: z.string().min(1).max(100),
  colorCode: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  monthlySpaceFee: z.number().int().min(0).optional(),
  spaceFeeEnabled: z.boolean().optional(),
  role: z.enum(["OWNER", "PARTNER"]).optional(),
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
    await checkCurrentStoreFeature(FEATURES.STAFF_MANAGEMENT);
    const data = createStaffSchema.parse(input);
    const writeStoreId = await resolveWriteStoreId(sessionUser);

    // 用量限制：檢查員工數量上限
    const { checkStaffLimitOrThrow } = await import("@/lib/usage-gate");
    const currentStaffCount = await prisma.staff.count({
      where: { storeId: writeStoreId, status: "ACTIVE" },
    });
    await checkStaffLimitOrThrow(currentStaffCount);

    // 檢查 email 是否已存在
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError("CONFLICT", "此 Email 已被使用");

    const passwordHash = hashSync(data.password, 10);
    const staffRole: UserRole = data.role ?? "OWNER";

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
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
          },
        },
      },
      include: { staff: true },
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
      include: { user: { select: { id: true } } },
    });
    if (!staff) throw new AppError("NOT_FOUND", "員工不存在");
    if (staff.storeId !== writeStoreId) {
      throw new AppError("FORBIDDEN", "無權存取其他店舖的員工資料");
    }
    if (staff.isOwner) throw new AppError("FORBIDDEN", "無法修改系統管理者帳號");

    // 更新 Staff 基本資料
    const { role: newRole, ...staffData } = data;
    await prisma.staff.update({
      where: { id: staffId },
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

    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new AppError("NOT_FOUND", "員工不存在");
    if (staff.storeId !== writeStoreId) {
      throw new AppError("FORBIDDEN", "無權存取其他店舖的員工資料");
    }
    if (staff.isOwner) throw new AppError("FORBIDDEN", "無法停用系統管理者帳號");

    await prisma.$transaction([
      prisma.staff.update({ where: { id: staffId }, data: { status: "INACTIVE" } }),
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

    // OWNER 僅能重設 PARTNER；不得重設其他 OWNER / ADMIN / 系統管理者
    if (sessionUser.role === "OWNER" && targetStaff.user.role !== "PARTNER") {
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

    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new AppError("NOT_FOUND", "員工不存在");
    if (staff.storeId !== writeStoreId) {
      throw new AppError("FORBIDDEN", "無權存取其他店舖的員工資料");
    }
    if (staff.isOwner) throw new AppError("FORBIDDEN", "無法修改系統管理者帳號");

    await prisma.$transaction([
      prisma.staff.update({ where: { id: staffId }, data: { status: "ACTIVE" } }),
      prisma.user.update({ where: { id: staff.userId }, data: { status: "ACTIVE" } }),
    ]);

    revalidateStaff();
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
