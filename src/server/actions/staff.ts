"use server";

import { z } from "zod";
import { hashSync } from "bcryptjs";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { requireStaffSession } from "@/lib/session";
import { AppError, handleActionError } from "@/lib/errors";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import {
  ALL_PERMISSIONS,
  getDefaultPermissionsForRole,
  checkPermission,
  type PermissionCode,
} from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { revalidateStaff, revalidateStaffPermissions } from "@/lib/revalidation";
import type { UserRole } from "@prisma/client";
import type { ActionResult } from "@/types";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { isSpaCompensationSchemaReady, isSpaOperationalSchemaReady } from "@/lib/spa-schema-readiness";
import { requireSpaStore } from "@/lib/industry-module-server";
import { SPA_SKILLS, spaSkillId } from "@/lib/spa-store-identifiers";
import { recordOperationAudit } from "@/server/services/operation-audit";

import { canManageStaffRole, canAssignStaffRole, assertStoreRetainsOwner, readStaffManagerGrants } from "@/lib/staff-role-policy";

const spaSkillKeys = ["body", "head", "foot", "face"] as const;
const spaTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 管理身份與 staff.manage 雙重守門，所有 mutation 仍須驗證 store scope。 */
async function requireStaffManageSession() {
  const user = await requireStaffSession();
  if (!["OWNER", "MANAGER", "ADMIN"].includes(user.role) ||
      !(await checkPermission(user.role, user.staffId, "staff.manage"))) {
    throw new AppError("FORBIDDEN", "您沒有店員管理權限");
  }
  return user;
}

/** Owner 管理店內帳號；Manager 僅管理 Staff / 舊 PARTNER；禁止自我調整。 */
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

  // 非 ADMIN 仍需管理權限。
  const ok = await checkPermission(
    sessionUser.role,
    sessionUser.staffId,
    "staff.manage",
  );
  if (!ok) throw new AppError("FORBIDDEN", "您沒有店員管理權限");

  if (!canManageStaffRole(sessionUser.role, targetStaff.user.role)) {
    throw new AppError("FORBIDDEN", "店長僅可管理門市人員，不能調整老闆或其他店長");
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
  role: z.enum(["OWNER", "MANAGER", "STAFF", "PARTNER"]).optional(),
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
  role: z.enum(["OWNER", "MANAGER", "STAFF", "PARTNER"]).optional(),
  applyRolePreset: z.boolean().optional(),
  phone: z.string().trim().max(30).optional(),
  permissions: z.record(z.enum(ALL_PERMISSIONS), z.boolean()).optional(),
  email: z.string().trim().email().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const resetStaffPasswordSchema = z.object({
  userId: z.string().min(1),
  newPassword: z.string().min(8, "新密碼至少需要 8 碼"),
});

// ============================================================
// createStaff — scoped account management
// ============================================================

export async function createStaff(
  input: z.infer<typeof createStaffSchema>
): Promise<ActionResult<{ staffId: string }>> {
  try {
    const sessionUser = await requireStaffManageSession();
    const data = createStaffSchema.parse(input);
    const staffRole: UserRole = data.role ?? "STAFF";
    if (!canAssignStaffRole(sessionUser.role, staffRole)) throw new AppError("FORBIDDEN", "店長只能建立門市人員帳號");
    const writeStoreId = await resolveWriteStoreId(sessionUser);
    const hasSpaSetup = Boolean(data.spaCompensation || data.spaSkillKeys || data.spaWeeklyAvailability);
    if (hasSpaSetup) await requireSpaStore(writeStoreId);
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
    await checkStaffLimitOrThrow(currentStaffCount, writeStoreId);

    // 檢查 email 是否已存在
    if (normalizedEmail) {
      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing) throw new AppError("CONFLICT", "此 Email 已被使用");
    }
    const existingPhone = await prisma.user.findFirst({
      where: { phone: data.phone, role: staffRole },
      select: { id: true },
    });
    if (existingPhone) throw new AppError("CONFLICT", "此手機號碼已建立相同身分的帳號");

    const passwordHash = hashSync(data.password, 10);

    if (data.spaSkillKeys) {
      await spaPrisma.$transaction(async (tx) => {
        for (const [sortOrder, skill] of SPA_SKILLS.entries()) {
          if (!data.spaSkillKeys?.includes(skill.key)) continue;
          const id = spaSkillId(writeStoreId, skill.key);
          await tx.spaSkill.upsert({
            where: { id },
            create: { id, storeId: writeStoreId, name: skill.name, sortOrder },
            update: { name: skill.name, sortOrder, isActive: true },
          });
        }
      });
    }

    const user = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${writeStoreId} FOR UPDATE`;
      const managerGrants = await readStaffManagerGrants(tx, sessionUser, writeStoreId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`staff-capacity:${writeStoreId}`}, 0))`;
      await checkStaffLimitOrThrow(await tx.staff.count({ where: { storeId: writeStoreId, status: "ACTIVE" } }), writeStoreId);
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
            },
          },
        },
        include: { staff: true },
      });
      if (created.staff) {
        const defaults = getDefaultPermissionsForRole(staffRole);
        await tx.staffPermission.createMany({ data: ALL_PERMISSIONS.map(permission => ({ staffId: created.staff!.id, permission, granted: defaults.includes(permission) && (managerGrants === null || managerGrants.has(permission)) })) });
      }
      await recordOperationAudit({ actorUserId: sessionUser.id, actorNameSnapshot: sessionUser.name, storeId: writeStoreId, module: "SYSTEM", targetType: "Staff", targetId: created.staff!.id, action: "CREATE", summary: "建立人員帳號", after: { role: staffRole } }, tx);
      return created;
    });

    if (user.staff && hasSpaSetup) {
      await spaPrisma.$transaction(async (tx) => {
        if (data.spaSkillKeys?.length) await tx.spaStaffSkill.createMany({ data: data.spaSkillKeys.map((key) => ({ storeId: writeStoreId, staffId: user.staff!.id, skillId: spaSkillId(writeStoreId, key) })) });
        if (data.spaWeeklyAvailability?.length) await tx.spaStaffAvailability.createMany({ data: data.spaWeeklyAvailability.map((availability) => ({ ...availability, storeId: writeStoreId, staffId: user.staff!.id })) });
        if (data.spaCompensation) await tx.spaStaffCompensation.create({ data: { storeId: writeStoreId, staffId: user.staff!.id, mode: data.spaCompensation.mode, value: data.spaCompensation.value } });
      });
    }

    revalidateStaff();
    return { success: true, data: { staffId: user.staff!.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// updateStaff — scoped account management
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

    const activationLimits = data.status === "ACTIVE" ? await (await import("@/lib/feature-gate")).getStoreLimitsByStoreId(writeStoreId) : null;
    const { role: newRole, applyRolePreset, permissions, email, ...staffData } = data;
    if (permissions && applyRolePreset) throw new AppError("VALIDATION", "請選擇角色預設或自訂權限");
    if (newRole && newRole !== staff.user.role && !canAssignStaffRole(sessionUser.role, newRole)) {
      throw new AppError("FORBIDDEN", "店長不能提升帳號角色");
    }
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${writeStoreId} FOR UPDATE`;
      const current = await tx.staff.findUniqueOrThrow({ where: { id: staffId }, include: { user: true } });
      const storedPermissions = (await tx.staffPermission.findMany({ where: { staffId, granted: true }, select: { permission: true } })).map(p => p.permission).sort();
      const actorGrants = await readStaffManagerGrants(tx, sessionUser, writeStoreId);
      if (current.userId === sessionUser.id || !canManageStaffRole(sessionUser.role, current.user.role)) throw new AppError("FORBIDDEN", "無權管理此帳號");
      if (data.status === "INACTIVE" || (newRole && newRole !== "OWNER")) await assertStoreRetainsOwner(tx, writeStoreId, staffId);
      if (data.status === "ACTIVE" && current.status !== "ACTIVE" && activationLimits?.maxStaff !== null) {
        const activeCount = await tx.staff.count({ where: { storeId: writeStoreId, status: "ACTIVE" } });
        if (activationLimits && activeCount >= activationLimits.maxStaff!) throw new AppError("FORBIDDEN", `本店最多 ${activationLimits.maxStaff} 位可啟用人員`);
      }
      if (data.status === "INACTIVE" && current.user.role === "ADMIN" && await tx.user.count({ where: { role: "ADMIN", status: "ACTIVE", id: { not: current.userId } } }) === 0) throw new AppError("FORBIDDEN", "至少須保留一位系統管理者");
      const resultingRole = newRole ?? current.user.role;
      const resultingPermissions = new Set(storedPermissions);
      if (permissions) {
        if (resultingRole === "OWNER" || resultingRole === "ADMIN") throw new AppError("FORBIDDEN", "老闆權限全開放");
        for (const [permission, granted] of Object.entries(permissions)) {
          if (actorGrants && resultingPermissions.has(permission) !== granted && !actorGrants.has(permission)) throw new AppError("FORBIDDEN", "只能調整自己已獲授權的功能");
          if (granted) resultingPermissions.add(permission); else resultingPermissions.delete(permission);
        }
      }
      await tx.staff.update({ where: { id: staffId, storeId: writeStoreId }, data: staffData });
      if (newRole && newRole !== current.user.role) {
        if (current.user.role === "ADMIN" && await tx.user.count({ where: { role: "ADMIN", status: "ACTIVE", id: { not: current.userId } } }) === 0) throw new AppError("FORBIDDEN", "至少須保留一位系統管理者");
        await tx.user.update({ where: { id: current.userId }, data: { role: newRole } });
      }
      if (data.status !== undefined && data.status !== current.status) await tx.user.update({ where: { id: current.userId }, data: { status: data.status === "ACTIVE" ? "ACTIVE" : "SUSPENDED" } });
      if (email !== undefined) await tx.user.update({ where: { id: current.userId }, data: { email: normalizeEmail(email) } });
      if (permissions) {
        for (const [permission, granted] of Object.entries(permissions)) {
          if (storedPermissions.includes(permission) === granted) continue;
          await tx.staffPermission.upsert({
          where: { staffId_permission: { staffId, permission } },
          create: { staffId, permission, granted }, update: { granted },
          });
        }
      }
      if (applyRolePreset) {
        if (sessionUser.role === "MANAGER") throw new AppError("FORBIDDEN", "請由老闆套用角色預設");
        const defaults = getDefaultPermissionsForRole(newRole ?? current.user.role);
        for (const permission of ALL_PERMISSIONS) await tx.staffPermission.upsert({
          where: { staffId_permission: { staffId, permission } },
          create: { staffId, permission, granted: defaults.includes(permission) },
          update: { granted: defaults.includes(permission) },
        });
      }
      await recordOperationAudit({
        actorUserId: sessionUser.id, actorNameSnapshot: sessionUser.name, storeId: writeStoreId,
        module: "SYSTEM", targetType: "Staff", targetId: staffId, action: "UPDATE", summary: "調整人員角色與資料",
        before: { status: current.status, role: current.user.role, permissions: current.user.role === "OWNER" ? [...ALL_PERMISSIONS] : storedPermissions },
        after: { status: data.status ?? current.status, role: newRole ?? current.user.role, applyRolePreset: Boolean(applyRolePreset),
          permissions: (newRole ?? current.user.role) === "OWNER" ? [...ALL_PERMISSIONS] : applyRolePreset ? getDefaultPermissionsForRole(newRole ?? current.user.role) : Array.from(resultingPermissions).sort() },
      }, tx);
    }, { maxWait: 5_000, timeout: 15_000 });
    revalidateStaffPermissions();
    revalidateStaff();
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// deactivateStaff — scoped account management
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
    await prisma.$transaction(async tx => {
      await assertStoreRetainsOwner(tx, writeStoreId, staffId);
      const current = await tx.staff.findUniqueOrThrow({ where: { id: staffId }, include: { user: true } });
      await readStaffManagerGrants(tx, sessionUser, writeStoreId);
      if (current.userId === sessionUser.id || !canManageStaffRole(sessionUser.role, current.user.role)) throw new AppError("FORBIDDEN", "無權管理此帳號");
      await tx.staff.update({ where: { id: staffId, storeId: writeStoreId }, data: { status: "INACTIVE" } });
      await tx.user.update({ where: { id: current.userId }, data: { status: "SUSPENDED" } });
      await recordOperationAudit({ actorUserId: sessionUser.id, actorNameSnapshot: sessionUser.name, storeId: writeStoreId, module: "SYSTEM", targetType: "Staff", targetId: staffId, action: "DEACTIVATE", summary: "停用人員", before: { status: current.status, role: current.user.role }, after: { status: "INACTIVE", role: current.user.role } }, tx);
    });

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
    await assertCanManageStaff(sessionUser, targetStaff);
    if (targetStaff.user.role === "ADMIN") throw new AppError("FORBIDDEN", "無法重設系統管理者帳號");

    const passwordHash = hashSync(data.newPassword, 10);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${writeStoreId} FOR UPDATE`;
      await readStaffManagerGrants(tx, sessionUser, writeStoreId);
      const current = await tx.staff.findUniqueOrThrow({ where: { id: targetStaff.id }, include: { user: true } });
      if (!canManageStaffRole(sessionUser.role, current.user.role) || current.user.role === "ADMIN") throw new AppError("FORBIDDEN", "無權管理此帳號");
      await tx.user.update({ where: { id: data.userId }, data: { passwordHash } });
      await recordOperationAudit({ actorUserId: sessionUser.id, actorNameSnapshot: sessionUser.name, storeId: writeStoreId,
        module: "SYSTEM", targetType: "Staff", targetId: current.id, action: "PASSWORD_RESET", summary: "重設人員登入密碼" }, tx);
    });

    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// activateStaff — scoped account management
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

    // Resolve plan data before acquiring the transaction connection. Looking it up
    // through the global client inside this transaction can exhaust a small pool.
    const { getStoreLimitsByStoreId } = await import("@/lib/feature-gate");
    const activationLimits = await getStoreLimitsByStoreId(writeStoreId);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${writeStoreId} FOR UPDATE`;
      await readStaffManagerGrants(tx, sessionUser, writeStoreId);
      const target = await tx.staff.findUniqueOrThrow({ where: { id: staffId }, include: { user: true } });
      if (!canManageStaffRole(sessionUser.role, target.user.role)) throw new AppError("FORBIDDEN", "無權管理此帳號");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`staff-capacity:${writeStoreId}`}, 0))`;
      const current = await tx.staff.findUniqueOrThrow({ where: { id: staffId } });
      if (current.status !== "ACTIVE") {
        const activeCount = await tx.staff.count({ where: { storeId: writeStoreId, status: "ACTIVE" } });
        if (activationLimits.maxStaff !== null && activeCount >= activationLimits.maxStaff) {
          throw new AppError("FORBIDDEN", `本店最多 ${activationLimits.maxStaff} 位可啟用人員，請先停用其他人員或調整方案`);
        }
      }
      await tx.staff.update({ where: { id: staffId, storeId: writeStoreId }, data: { status: "ACTIVE" } });
      await tx.user.update({ where: { id: target.userId }, data: { status: "ACTIVE" } });
      await recordOperationAudit({ actorUserId: sessionUser.id, actorNameSnapshot: sessionUser.name, storeId: writeStoreId, module: "SYSTEM", targetType: "Staff", targetId: staffId, action: "ACTIVATE", summary: "啟用人員", before: { status: current.status, role: target.user.role }, after: { status: "ACTIVE", role: target.user.role } }, tx);
    }, { maxWait: 5_000, timeout: 15_000 });

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

    for (const [code, granted] of Object.entries(permissions)) {
      if (!(ALL_PERMISSIONS as readonly string[]).includes(code) || typeof granted !== "boolean") throw new AppError("VALIDATION", "權限設定不正確");
    }
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${writeStoreId} FOR UPDATE`;
      const actorGrants = await readStaffManagerGrants(tx, sessionUser, writeStoreId);
      const current = await tx.staff.findUniqueOrThrow({ where: { id: staffId }, include: { user: true } });
      if (current.userId === sessionUser.id || !canManageStaffRole(sessionUser.role, current.user.role)) throw new AppError("FORBIDDEN", "無權管理此帳號");
      if (current.user.role === "OWNER" || current.user.role === "ADMIN") throw new AppError("FORBIDDEN", "老闆權限全開放，請以角色調整管理帳號");
      const before = new Set((await tx.staffPermission.findMany({ where: { staffId, granted: true }, select: { permission: true } })).map(p => p.permission));
      const after = new Set(before);
      for (const [permission, granted] of Object.entries(permissions)) {
        if (actorGrants && before.has(permission) !== granted && !actorGrants.has(permission)) throw new AppError("FORBIDDEN", "只能調整自己已獲授權的功能");
        if (granted) after.add(permission); else after.delete(permission);
        await tx.staffPermission.upsert({ where: { staffId_permission: { staffId, permission } },
          create: { staffId, permission, granted }, update: { granted } });
      }
      await recordOperationAudit({
        actorUserId: sessionUser.id, actorNameSnapshot: sessionUser.name, storeId: writeStoreId,
        module: "SYSTEM", targetType: "StaffPermission", targetId: staffId, action: "UPDATE", summary: "調整人員權限",
        before: { permissions: Array.from(before).sort() }, after: { permissions: Array.from(after).sort() },
      }, tx);
    });
    revalidateStaffPermissions();
    revalidateStaff();
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
