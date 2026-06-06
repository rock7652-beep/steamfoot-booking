"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requireSession, requireStaffSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import {
  createCustomerSchema,
  updateCustomerSchema,
  transferCustomerSchema,
  updateCustomerAssignmentSchema,
  bulkUpdateCustomerAssignmentSchema,
  updateCustomerServiceNoteSchema,
} from "@/lib/validators/customer";
import type { ActionResult } from "@/types";
import { getCustomerDrawerDetail } from "@/server/queries/customer";
import { checkCustomerLimit } from "@/lib/shop-config";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { currentStoreId } from "@/lib/store";
import { normalizePhone } from "@/lib/normalize";
import type { z } from "zod";

// ============================================================
// createCustomer — Owner（可指定 assignedStaffId）/ Manager（自動綁自己）
// ============================================================
// 返回型別覆寫 ActionResult — 重複 phone/email 時額外帶 existingCustomerId
// 讓前端可導到既有顧客頁，避免店長盲目重試或誤建第二筆。
// （UI 目前只用 .error 顯示訊息；existingCustomerId 為前端後續導頁準備。）

type CreateCustomerResult =
  | { success: true; data: { customerId: string } }
  | { success: false; error: string; existingCustomerId?: string };

export async function createCustomer(
  input: z.infer<typeof createCustomerSchema>
): Promise<CreateCustomerResult> {
  try {
    const user = await requirePermission("customer.create");
    // schema.parse 內含 normalizePhone transform — data.phone 一律 09xxxxxxxx
    const data = createCustomerSchema.parse(input);

    // FREE 方案顧客數限制
    const customerLimit = await checkCustomerLimit(currentStoreId(user));
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

    // 檢查電話是否重複（同店；_oauth_xxx 佔位 phone 不會撞，因為 data.phone 已 normalize 為 09xx）
    const storeId = currentStoreId(user);
    if (data.phone) {
      const existingPhone = await prisma.customer.findFirst({
        where: { phone: data.phone, storeId },
        select: { id: true },
      });
      if (existingPhone) {
        return {
          success: false,
          error: "此手機號碼已存在於本店，請改為編輯既有顧客或更換手機號碼。",
          existingCustomerId: existingPhone.id,
        };
      }
    }

    // 檢查 email 是否重複（限同店）
    if (data.email) {
      const existingEmail = await prisma.customer.findFirst({
        where: { email: data.email, storeId },
        select: { id: true },
      });
      if (existingEmail) {
        return {
          success: false,
          error: "此 Email 已存在於本店，請改為編輯既有顧客或更換 Email。",
          existingCustomerId: existingEmail.id,
        };
      }
    }

    const customer = await prisma.customer.create({
      data: {
        name: data.name,
        phone: data.phone,
        // email/gender/birthday 都改為 optional；缺時寫 null（DB 已是 nullable）
        email: data.email ?? null,
        gender: data.gender ?? null,
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
// 同 createCustomer：phone/email 撞同店其他顧客時，回 existingCustomerId，
// 不再讓使用者只看到 P2002 generic 訊息。

type UpdateCustomerResult =
  | { success: true; data: undefined }
  | { success: false; error: string; existingCustomerId?: string };

export async function updateCustomer(
  customerId: string,
  input: z.infer<typeof updateCustomerSchema>
): Promise<UpdateCustomerResult> {
  try {
    const user = await requirePermission("customer.update");
    // schema.parse 內含 normalizePhone — data.phone 一律 09xxxxxxxx
    const data = updateCustomerSchema.parse(input);

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
    assertStoreAccess(user, customer.storeId);

    // 同店員工皆可操作（權限已由 requirePermission 把關）
    // assignedStaffId 僅用於歸屬/報表，不限制寫入操作

    // 改 phone → 先查同店有沒有其他顧客已用這支（_oauth_xxx 佔位不會撞）
    if (data.phone && data.phone !== customer.phone) {
      const existingPhone = await prisma.customer.findFirst({
        where: { phone: data.phone, storeId: customer.storeId, id: { not: customerId } },
        select: { id: true },
      });
      if (existingPhone) {
        return {
          success: false,
          error: "此手機號碼已被本店其他顧客使用，請改用編輯既有顧客或更換手機號碼。",
          existingCustomerId: existingPhone.id,
        };
      }
    }

    // 改 email → 同邏輯
    if (data.email && data.email !== customer.email) {
      const existingEmail = await prisma.customer.findFirst({
        where: { email: data.email, storeId: customer.storeId, id: { not: customerId } },
        select: { id: true },
      });
      if (existingEmail) {
        return {
          success: false,
          error: "此 Email 已被本店其他顧客使用，請改用編輯既有顧客或更換 Email。",
          existingCustomerId: existingEmail.id,
        };
      }
    }

    // 後台補資料情境：name + phone 之外，欄位空白 → 寫 null 清除 DB。
    // 對「未提供」（其它 caller 不送這個欄位）與「使用者清空」這兩種情況，
    // 表單一律送 undefined，這裡統一處理成「寫 null」。
    // 其他純可選欄位（lineName / notes / customerStage / selfBookingEnabled /
    // assignedStaffId）若 caller 完全沒提供（undefined），則略過不寫；提供 null
    // 才視為清除。這讓 partial update caller 不會誤清欄位。
    const prismaData: Record<string, unknown> = {
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      gender: data.gender ?? null,
      birthday: data.birthday ? new Date(data.birthday) : null,
      height: data.height ?? null,
    };
    if (data.lineName !== undefined) prismaData.lineName = data.lineName;
    if (data.notes !== undefined) prismaData.notes = data.notes;
    if (data.customerStage !== undefined) prismaData.customerStage = data.customerStage;
    if (data.selfBookingEnabled !== undefined)
      prismaData.selfBookingEnabled = data.selfBookingEnabled;
    if (data.assignedStaffId !== undefined)
      prismaData.assignedStaffId = data.assignedStaffId;

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
// updateCustomerServiceNoteAction — 內部服務備註（後台限定，單一欄位更新）
// ------------------------------------------------------------
// 權限沿用 customer.update（ADMIN / OWNER / PARTNER-with-grant / 任何顧客編輯權限者）；
// 只有 customer.read 者看得到但呼叫此 action 會被 requirePermission 擋下。
// 走專用 action 而非整包 updateCustomer，避免誤改姓名/電話/生日/店長/狀態等欄位。
// store filter（assertStoreAccess）確保跨店不可改。
// **不**把備註全文寫入任何 log / audit：AuditLog 只記 content-free 事件（無 before/after）。
// ============================================================
export async function updateCustomerServiceNoteAction(
  input: z.infer<typeof updateCustomerServiceNoteSchema>,
): Promise<ActionResult<undefined>> {
  try {
    const user = await requirePermission("customer.update");
    const { customerId, serviceNote } =
      updateCustomerServiceNoteSchema.parse(input);

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, storeId: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
    assertStoreAccess(user, customer.storeId);

    await prisma.customer.update({
      where: { id: customerId },
      data: { serviceNote },
    });

    // Audit：content-free —— 只記「誰、對哪位顧客、做了什麼」，**不**存備註全文
    // （刻意不帶 beforeJson / afterJson）。
    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        targetType: "Customer",
        targetId: customerId,
        action: "SERVICE_NOTE_UPDATED",
      },
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
    console.error("[updateCustomerAssignment] error:", e);
    return handleActionError(e);
  }
}

// ============================================================
// bulkUpdateCustomerAssignment — 顧客列表批次指派直屬店長
//
// 只更新 Customer.assignedStaffId。不動 sponsorId、Booking、Transaction、Wallet。
// staff 驗證一次（同店 + ACTIVE）失敗則整批中止。
// 個別 customer 失敗（找不到 / 不同店）→ errors[]；
// 個別 customer 已合併 / 帳號停用 → skipped（不算失敗）。
//
// 權限：customer.assign（與單筆 updateCustomerAssignment 一致）
// ============================================================

export interface BulkUpdateCustomerAssignmentResult {
  successCount: number;
  failedCount: number;
  skippedCount: number;
  errors: { customerId: string; reason: string }[];
}

export async function bulkUpdateCustomerAssignment(
  input: z.infer<typeof bulkUpdateCustomerAssignmentSchema>,
): Promise<ActionResult<BulkUpdateCustomerAssignmentResult>> {
  try {
    const user = await requirePermission("customer.assign");
    const data = bulkUpdateCustomerAssignmentSchema.parse(input);
    const storeId = currentStoreId(user);

    // 1. 驗 staff（整批共用一次驗證，失敗即中止）
    const staff = await prisma.staff.findUnique({
      where: { id: data.assignedStaffId },
      select: { id: true, storeId: true, status: true },
    });
    if (!staff || staff.status !== "ACTIVE") {
      throw new AppError("NOT_FOUND", "指定店長不存在或已停用");
    }
    if (staff.storeId !== storeId) {
      throw new AppError("VALIDATION", "店長不屬於此店別");
    }

    // 2. 一次 fetch 所有 target customers
    const customers = await prisma.customer.findMany({
      where: { id: { in: data.customerIds } },
      select: {
        id: true,
        storeId: true,
        mergedIntoCustomerId: true,
        user: { select: { status: true } },
      },
    });
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    // 3. 分類：valid / errors / skipped
    const validIds: string[] = [];
    const errors: { customerId: string; reason: string }[] = [];
    let skippedCount = 0;

    for (const cid of data.customerIds) {
      const c = customerMap.get(cid);
      if (!c) {
        errors.push({ customerId: cid, reason: "顧客不存在" });
        continue;
      }
      if (c.storeId !== storeId) {
        errors.push({ customerId: cid, reason: "顧客不屬於此店別" });
        continue;
      }
      if (c.mergedIntoCustomerId) {
        skippedCount++;
        continue;
      }
      if (c.user?.status === "SUSPENDED") {
        skippedCount++;
        continue;
      }
      validIds.push(cid);
    }

    // 4. 批次寫入（單一 updateMany，雙保險：where 再寫 storeId）
    if (validIds.length > 0) {
      await prisma.customer.updateMany({
        where: { id: { in: validIds }, storeId },
        data: { assignedStaffId: data.assignedStaffId },
      });
      revalidatePath("/dashboard/customers");
    }

    return {
      success: true,
      data: {
        successCount: validIds.length,
        failedCount: errors.length,
        skippedCount,
        errors,
      },
    };
  } catch (e) {
    console.error("[bulkUpdateCustomerAssignment] error:", e);
    return handleActionError(e);
  }
}

// ============================================================
// searchReferrerCandidates — drawer 推薦人欄位查詢用
//
// 店長輸入「姓名」或「手機」（部分即可）在當前店內找候選顧客清單。
// - 同店 only（storeId），不跨店搜尋。
// - 排除自己（excludeCustomerId）避免把顧客設成自己的推薦人。
// - 回傳遮罩手機（avoid 完整號碼外洩），同名時店長可依手機辨識後選。
// - 不丟 error；查無資料回傳空陣列，UI 呈現「找不到符合的顧客」。
// - 需要 customer.read 權限。
// ============================================================

// 遮罩手機：0972123456 → 0972•••456（保留前 4、後 3，方便辨識又不外洩全碼）
function maskPhone(phone: string): string {
  if (!phone) return "";
  if (phone.length <= 7) return phone;
  return `${phone.slice(0, 4)}•••${phone.slice(-3)}`;
}

export async function searchReferrerCandidates(
  query: string,
  excludeCustomerId?: string,
): Promise<ActionResult<Array<{ id: string; name: string; phoneMasked: string }>>> {
  try {
    const user = await requirePermission("customer.read");
    const q = (query ?? "").trim();
    if (q.length < 1) return { success: true, data: [] };

    const storeId = currentStoreId(user);

    // 姓名一律 contains；若 query 含數字，額外用正規化後的數字做手機 contains。
    const or: Prisma.CustomerWhereInput[] = [
      { name: { contains: q, mode: "insensitive" } },
    ];
    if (/\d/.test(q)) {
      const digits = normalizePhone(q);
      if (digits) or.push({ phone: { contains: digits } });
    }

    const matches = await prisma.customer.findMany({
      where: {
        storeId,
        ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}),
        OR: or,
      },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
      take: 10,
    });

    return {
      success: true,
      data: matches.map((m) => ({
        id: m.id,
        name: m.name,
        phoneMasked: maskPhone(m.phone),
      })),
    };
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

// ============================================================
// getCustomerDrawerDetailAction — 顧客管理右滑 Drawer 取詳情（PR-4）
//
// client 端（list-with-drawer）點顧客 / refreshDrawer 時呼叫。
// 後端權限把關：先 requirePermission("customer.read") 比照顧客列表頁的
// checkPermission，避免無 customer.read 權限者直接呼叫 server action 繞過
// 頁面 UI 閘讀取顧客資料；跨店 / merged / SUSPENDED 邊界仍由
// getCustomerDrawerDetail 內部（getStoreFilter + 安全閘）處理。
// 以 handleActionError 把 AppError 轉成 ActionResult，不額外開洞。
// 純讀取：不寫 DB、不 revalidatePath。
// ============================================================

export async function getCustomerDrawerDetailAction(
  customerId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof getCustomerDrawerDetail>>>> {
  try {
    await requirePermission("customer.read");
    const data = await getCustomerDrawerDetail(customerId);
    return { success: true, data };
  } catch (e) {
    return handleActionError(e);
  }
}
