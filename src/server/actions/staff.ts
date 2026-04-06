"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { hashSync } from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireOwnerSession } from "@/lib/session";
import { AppError, handleActionError } from "@/lib/errors";
import type { ActionResult } from "@/types";

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
});

const updateStaffSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  colorCode: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  monthlySpaceFee: z.number().int().min(0).optional(),
  spaceFeeEnabled: z.boolean().optional(),
});

// ============================================================
// createStaff — Owner only
// ============================================================

export async function createStaff(
  input: z.infer<typeof createStaffSchema>
): Promise<ActionResult<{ staffId: string }>> {
  try {
    await requireOwnerSession();
    const data = createStaffSchema.parse(input);

    // 檢查 email 是否已存在
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError("CONFLICT", "此 Email 已被使用");

    const passwordHash = hashSync(data.password, 10);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        passwordHash,
        role: "MANAGER",
        staff: {
          create: {
            displayName: data.displayName,
            colorCode: data.colorCode ?? "#6366f1",
            isOwner: false,
            monthlySpaceFee: data.monthlySpaceFee ?? 0,
            spaceFeeEnabled: data.spaceFeeEnabled ?? true,
          },
        },
      },
      include: { staff: true },
    });

    revalidatePath("/dashboard/staff");
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
    await requireOwnerSession();
    const data = updateStaffSchema.parse(input);

    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new AppError("NOT_FOUND", "店長不存在");
    if (staff.isOwner) throw new AppError("FORBIDDEN", "無法修改店主帳號");

    await prisma.staff.update({
      where: { id: staffId },
      data,
    });

    revalidatePath("/dashboard/staff");
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
    await requireOwnerSession();

    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new AppError("NOT_FOUND", "店長不存在");
    if (staff.isOwner) throw new AppError("FORBIDDEN", "無法停用店主帳號");

    await prisma.$transaction([
      prisma.staff.update({ where: { id: staffId }, data: { status: "INACTIVE" } }),
      prisma.user.update({ where: { id: staff.userId }, data: { status: "SUSPENDED" } }),
    ]);

    revalidatePath("/dashboard/staff");
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
    await requireOwnerSession();

    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new AppError("NOT_FOUND", "店長不存在");
    if (staff.isOwner) throw new AppError("FORBIDDEN", "無法修改店主帳號");

    await prisma.$transaction([
      prisma.staff.update({ where: { id: staffId }, data: { status: "ACTIVE" } }),
      prisma.user.update({ where: { id: staff.userId }, data: { status: "ACTIVE" } }),
    ]);

    revalidatePath("/dashboard/staff");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
