"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession, requireStaffSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import {
  createCustomerSchema,
  updateCustomerSchema,
  transferCustomerSchema,
} from "@/lib/validators/customer";
import type { ActionResult } from "@/types";
import { checkCustomerLimit } from "@/lib/shop-config";
import type { z } from "zod";

// ============================================================
// createCustomer — Owner（可指定 assignedStaffId）/ Manager（自動綁自己）
// ============================================================

export async function createCustomer(
  input: z.infer<typeof createCustomerSchema>
): Promise<ActionResult<{ customerId: string }>> {
  try {
    const user = await requirePermission("customer.create");
    const data = createCustomerSchema.parse(input);

    // FREE 方案顧客數限制
    const customerLimit = await checkCustomerLimit();
    if (!customerLimit.allowed) {
      return {
        success: false,
        error: `體驗版顧客上限 ${customerLimit.limit} 位已達，請升級方案以繼續新增`,
      };
    }

    // assignedStaffId 現在是選填
    let assignedStaffId: string | undefined;

    if (data.assignedStaffId) {
      const targetStaff = await prisma.staff.findUnique({
        where: { id: data.assignedStaffId, status: "ACTIVE" },
      });
      if (!targetStaff) throw new AppError("NOT_FOUND", "指定店長不存在");
      assignedStaffId = targetStaff.id;
    }
    // 不再強制指派 — 顧客可稍後由店長指派

    // 檢查電話是否重複（僅當有填寫電話時）
    if (data.phone) {
      const existingPhone = await prisma.customer.findFirst({
        where: { phone: data.phone },
      });
      if (existingPhone) throw new AppError("CONFLICT", "此電話號碼已存在於系統中");
    }

    // 檢查 email 是否重複（僅當有填寫時）
    if (data.email) {
      const existingEmail = await prisma.customer.findFirst({
        where: { email: data.email },
      });
      if (existingEmail) throw new AppError("CONFLICT", "此 Email 已存在於系統中");
    }

    const customer = await prisma.customer.create({
      data: {
        name: data.name,
        phone: data.phone || "",
        email: data.email || null,
        lineName: data.lineName,
        notes: data.notes,
        assignedStaffId: assignedStaffId || null,
        customerStage: "LEAD",
        selfBookingEnabled: false,
      },
    });

    revalidatePath("/dashboard/customers");
    return { success: true, data: { customerId: customer.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// updateCustomer — Owner（任意）/ Manager（自己名下）
// ============================================================

export async function updateCustomer(
  customerId: string,
  input: z.infer<typeof updateCustomerSchema>
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("customer.update");
    const data = updateCustomerSchema.parse(input);

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

    // Manager 只能修改自己名下顧客
    if (user.role === "MANAGER") {
      if (!user.staffId || customer.assignedStaffId !== user.staffId) {
        throw new AppError("FORBIDDEN", "無法修改其他店長名下的顧客");
      }
    }

    // birthday: string → Date 轉換
    const prismaData: Record<string, unknown> = { ...data };
    if (data.birthday !== undefined) {
      prismaData.birthday = data.birthday ? new Date(data.birthday) : null;
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: prismaData,
    });

    revalidatePath("/dashboard/customers");
    revalidatePath(`/dashboard/customers/${customerId}`);
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// transferCustomer — Owner only
// 轉讓不影響歷史 booking / transaction 的 revenueStaffId
// ============================================================

export async function transferCustomer(
  input: z.infer<typeof transferCustomerSchema>
): Promise<ActionResult<void>> {
  try {
    await requirePermission("customer.assign");
    const data = transferCustomerSchema.parse(input);

    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
    if (customer.assignedStaffId === data.newStaffId) {
      throw new AppError("VALIDATION", "顧客已隸屬於該店長");
    }

    const newStaff = await prisma.staff.findUnique({
      where: { id: data.newStaffId, status: "ACTIVE" },
    });
    if (!newStaff) throw new AppError("NOT_FOUND", "目標店長不存在");

    // 只更新 customer.assignedStaffId，歷史資料不動
    await prisma.customer.update({
      where: { id: data.customerId },
      data: { assignedStaffId: data.newStaffId },
    });

    revalidatePath("/dashboard/customers");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// updateCustomerStage — Owner / Manager（自己名下）
// ============================================================

export async function updateCustomerStage(
  customerId: string,
  stage: "LEAD" | "TRIAL" | "ACTIVE" | "INACTIVE"
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("customer.update");

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

    if (user.role === "MANAGER") {
      if (!user.staffId || customer.assignedStaffId !== user.staffId) {
        throw new AppError("FORBIDDEN", "無法修改其他店長名下的顧客");
      }
    }

    const updateData: Record<string, unknown> = { customerStage: stage };
    if (stage === "TRIAL" && !customer.firstVisitAt) {
      updateData.firstVisitAt = new Date();
    }

    await prisma.customer.update({ where: { id: customerId }, data: updateData });
    revalidatePath(`/dashboard/customers/${customerId}`);
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// setSelfBookingEnabled — Owner only
// ============================================================

export async function setSelfBookingEnabled(
  customerId: string,
  enabled: boolean
): Promise<ActionResult<void>> {
  try {
    const user = await requireSession();

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

    // Only owner can manually toggle; manager can't disable once enabled
    if (user.role !== "OWNER") {
      throw new AppError("FORBIDDEN", "此功能僅限店主使用");
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: { selfBookingEnabled: enabled },
    });

    revalidatePath(`/dashboard/customers/${customerId}`);
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
