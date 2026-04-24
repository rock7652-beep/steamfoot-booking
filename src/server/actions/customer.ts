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
  updateCustomerAssignmentSchema,
} from "@/lib/validators/customer";
import type { ActionResult } from "@/types";
import { checkCustomerLimit } from "@/lib/shop-config";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { currentStoreId } from "@/lib/store";
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

    // PricingPlan 顧客數限制
    const { checkCustomerLimitOrThrow } = await import("@/lib/usage-gate");
    const currentCustomerCount = await prisma.customer.count({
      where: { storeId: currentStoreId(user) },
    });
    await checkCustomerLimitOrThrow(currentCustomerCount);

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

    // 檢查電話是否重複（僅當有填寫電話時，限同店）
    const storeId = currentStoreId(user);
    if (data.phone) {
      const existingPhone = await prisma.customer.findFirst({
        where: { phone: data.phone, storeId },
      });
      if (existingPhone) throw new AppError("CONFLICT", "此電話號碼已存在於系統中");
    }

    // 檢查 email 是否重複（僅當有填寫時，限同店）
    if (data.email) {
      const existingEmail = await prisma.customer.findFirst({
        where: { email: data.email, storeId },
      });
      if (existingEmail) throw new AppError("CONFLICT", "此 Email 已存在於系統中");
    }

    const customer = await prisma.customer.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        gender: data.gender,
        birthday: data.birthday ? new Date(data.birthday) : null,
        lineName: data.lineName,
        notes: data.notes,
        assignedStaffId: assignedStaffId || null,
        customerStage: "LEAD",
        selfBookingEnabled: false,
        storeId: currentStoreId(user),
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
    assertStoreAccess(user, customer.storeId);

    // 同店員工皆可操作（權限已由 requirePermission 把關）
    // assignedStaffId 僅用於歸屬/報表，不限制寫入操作

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
    const user = await requirePermission("customer.assign");
    const data = transferCustomerSchema.parse(input);

    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
    assertStoreAccess(user, customer.storeId);
    if (customer.assignedStaffId === data.newStaffId) {
      throw new AppError("VALIDATION", "顧客已隸屬於該店長");
    }

    const newStaff = await prisma.staff.findUnique({
      where: { id: data.newStaffId, status: "ACTIVE" },
    });
    if (!newStaff) throw new AppError("NOT_FOUND", "目標店長不存在");
    assertStoreAccess(user, newStaff.storeId);

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
// updateCustomerAssignment — 顧客列表 drawer 「歸屬設定」專用
//
// 寫入兩個欄位：
//   - assignedStaffId：必填，需為同店 ACTIVE staff
//   - referredByCustomerId (→ Customer.sponsorId)：選填，null 代表清除
//
// 權限：customer.assign（OWNER 預設有；PARTNER 預設無）
// 與 transferCustomer 的差異：本 action 同時處理推薦人，且允許空 → 已指派。
// ============================================================

export async function updateCustomerAssignment(
  input: z.infer<typeof updateCustomerAssignmentSchema>,
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("customer.assign");
    const data = updateCustomerAssignmentSchema.parse(input);

    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, storeId: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
    assertStoreAccess(user, customer.storeId);

    // 店長必須同店 + ACTIVE
    const staff = await prisma.staff.findUnique({
      where: { id: data.assignedStaffId },
      select: { id: true, storeId: true, status: true },
    });
    if (!staff || staff.status !== "ACTIVE") {
      throw new AppError("NOT_FOUND", "指定店長不存在或已停用");
    }
    if (staff.storeId !== customer.storeId) {
      throw new AppError("VALIDATION", "店長不屬於此店別");
    }

    // 推薦人（若指定）：同店、不可指向自己
    const sponsorId = data.referredByCustomerId ?? null;
    if (sponsorId) {
      if (sponsorId === customer.id) {
        throw new AppError("VALIDATION", "推薦人不可為顧客本人");
      }
      const sponsor = await prisma.customer.findUnique({
        where: { id: sponsorId },
        select: { id: true, storeId: true },
      });
      if (!sponsor) throw new AppError("NOT_FOUND", "找不到推薦人");
      if (sponsor.storeId !== customer.storeId) {
        throw new AppError("VALIDATION", "推薦人不屬於此店別");
      }
    }

    await prisma.customer.update({
      where: { id: data.customerId },
      data: {
        assignedStaffId: data.assignedStaffId,
        sponsorId,
      },
    });

    revalidatePath("/dashboard/customers");
    revalidatePath(`/dashboard/customers/${data.customerId}`);
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// lookupCustomerByPhone — drawer 推薦人欄位查詢用
//
// 顧客端輸入電話（09 開頭 10 碼），在當前店內找對應顧客回傳 id + name。
// 不找到回傳 null（不丟 error，UI 呈現「查無此顧客」）。
// 排除自己（excludeCustomerId）避免把顧客設成自己的推薦人。
// 需要 customer.read 權限。
// ============================================================

export async function lookupCustomerByPhone(
  phone: string,
  excludeCustomerId?: string,
): Promise<ActionResult<{ id: string; name: string } | null>> {
  try {
    const user = await requirePermission("customer.read");
    const normalized = phone.replace(/[\s-]/g, "");
    if (!/^09\d{8}$/.test(normalized)) {
      throw new AppError("VALIDATION", "手機號碼格式不正確");
    }

    const storeId = currentStoreId(user);
    const match = await prisma.customer.findFirst({
      where: {
        phone: normalized,
        storeId,
        ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}),
      },
      select: { id: true, name: true },
    });

    return { success: true, data: match };
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
    assertStoreAccess(user, customer.storeId);

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
    assertStoreAccess(user, customer.storeId);

    // Only owner can manually toggle; manager can't disable once enabled
    if (user.role !== "ADMIN") {
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
