"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWritablePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { checkCurrentStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import type { ActionResult } from "@/types";
import type { CashbookEntryType } from "@prisma/client";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { resolveWriteStoreId } from "@/lib/store";
import { lockCashDay } from "@/server/services/cash-day";
import { parseTaiwanDateToDbDate, isAnalysisDate } from "@/lib/date-utils";

// ============================================================
// Validators
// ============================================================

// 付款方式：強制明選（無預設）。CASH = 實際收付現金；OTHER = 匯款 / 轉帳 / 非現金。
const paymentMethodSchema = z.enum(["CASH", "OTHER"], {
  errorMap: () => ({ message: "請選擇付款方式（現金 / 其他）" }),
});

const createCashbookEntrySchema = z.object({
  requestId: z.string().uuid().optional(),
  entryDate: z.string().refine(isAnalysisDate, "日期格式必須為有效的 YYYY-MM-DD"),
  type: z.enum(["INCOME", "EXPENSE", "WITHDRAW", "ADJUSTMENT"]),
  category: z.string().optional(),
  amount: z.number().positive("金額必須大於 0"),
  paymentMethod: paymentMethodSchema,
  staffId: z.string().optional(),
  customerId: z.string().optional(),
  note: z.string().optional(),
  // PR-4：當 entryDate 對應的現金抽屜已閉店、且為現金收付時，必須帶 true 明確確認。
  // 純防呆旗標，不寫入 DB；確認後仍不會回頭重算已閉店快照。
  confirmClosedCashbookChange: z.boolean().optional(),
});

const updateCashbookEntrySchema = z.object({
  entryDate: z
    .string()
    .refine(isAnalysisDate, "日期格式必須為有效的 YYYY-MM-DD")
    .optional(),
  type: z.enum(["INCOME", "EXPENSE", "WITHDRAW", "ADJUSTMENT"]).optional(),
  category: z.string().optional(),
  amount: z.number().positive("金額必須大於 0").optional(),
  paymentMethod: paymentMethodSchema.optional(),
  staffId: z.string().nullable().optional(),
  customerId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  // PR-4：見 createCashbookEntrySchema 同名欄位說明。
  confirmClosedCashbookChange: z.boolean().optional(),
});

const CLOSED_CASHBOOK_GUARD_MSG =
  "這一天已經結帳了。請先勾選「我知道這只是補紀錄」，確認後再送出。";

async function guardCashDay(tx: Parameters<typeof lockCashDay>[0], storeId: string, day: Date, confirmed?: boolean) {
  try { return await lockCashDay(tx, storeId, day, { allowClosedSupplement: confirmed }); }
  catch (error) {
    if (error instanceof AppError && error.code === "BUSINESS_RULE") throw new AppError("BUSINESS_RULE", CLOSED_CASHBOOK_GUARD_MSG);
    throw error;
  }
}

// 現金帳稽核快照（寫入 AuditLog.beforeJson / afterJson；不新增任何 schema）
function cashbookSnapshot(e: {
  entryDate: Date;
  type: string;
  category: string | null;
  amount: unknown;
  paymentMethod: string;
  staffId: string | null;
  customerId: string | null;
  note: string | null;
}) {
  return {
    entryDate: e.entryDate.toISOString(),
    type: e.type,
    category: e.category,
    amount: Number(e.amount),
    paymentMethod: e.paymentMethod,
    staffId: e.staffId,
    customerId: e.customerId,
    note: e.note,
  };
}

// ============================================================
// createCashbookEntry
// Owner / Staff（非 Owner 員工只能為自己名下建立）
// ============================================================

export async function createCashbookEntry(
  input: z.infer<typeof createCashbookEntrySchema>
): Promise<ActionResult<{ entryId: string }>> {
  try {
    const user = await requireWritablePermission("cashbook.create");
    await checkCurrentStoreFeature(FEATURES.CASHBOOK);
    const data = createCashbookEntrySchema.parse(input);
    // 寫入店別用 write-store 機制：OWNER/店長 用 JWT storeId；
    // ADMIN 無固定 storeId → 讀 active-store cookie（與頁面顯示同一店），
    // 未選店則明確報錯，避免寫錯店或 missing-store。
    const storeId = await resolveWriteStoreId(user);

    if (data.customerId && data.type !== "INCOME") {
      throw new AppError("VALIDATION", "只有收入可以關聯顧客");
    }
    if (data.customerId) {
      const customer = await prisma.customer.findFirst({
        where: {
          id: data.customerId,
          storeId,
          mergedIntoCustomerId: null,
          NOT: { user: { is: { status: "SUSPENDED" } } },
        },
        select: { id: true },
      });
      if (!customer) {
        throw new AppError("VALIDATION", "找不到這位顧客，請重新選擇");
      }
    }

    // 非 Owner 員工若未指定 staffId，自動綁定自己
    let staffId = data.staffId || null;
    if (user.role !== "ADMIN") {
      // 非 Owner 員工只能建立歸屬於自己的現金帳紀錄
      staffId = user.staffId ?? null;
    }

    const createData = {
      entryDate: parseTaiwanDateToDbDate(data.entryDate),
      type: data.type as CashbookEntryType,
      category: data.category || null,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      staffId,
      customerId: data.customerId || null,
      note: data.note || null,
      createdByUserId: user.id,
      storeId,
    };

    const entry = await prisma.$transaction(async (tx) => {
      if (data.requestId) {
        await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
        const previous = await tx.cashbookEntry.findUnique({ where: { id: `manual:${storeId}:${user.id}:${data.requestId}` } });
        if (previous) {
          if (JSON.stringify(cashbookSnapshot(previous)) !== JSON.stringify(cashbookSnapshot(createData)))
            throw new AppError("CONFLICT", "這筆記帳已完成，金額或內容已變更，請重新開啟核對。");
          return previous;
        }
      }
      const auditClosedCashCreate = data.paymentMethod === "CASH"
        ? await guardCashDay(tx, storeId, createData.entryDate, data.confirmClosedCashbookChange) : false;
      const created = await tx.cashbookEntry.create({ data: { ...createData, ...(data.requestId ? { id: `manual:${storeId}:${user.id}:${data.requestId}` } : {}) } });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorNameSnapshot: user.name,
          storeId,
          module: "SHARED",
          targetType: "CashbookEntry",
          targetId: created.id,
          action: "CREATE",
          summary: auditClosedCashCreate ? "補登已結帳日期的現金收支" : "新增現金收支",
          afterJson: cashbookSnapshot({ ...createData, entryDate: createData.entryDate }),
        },
      });
      return created;
    });

    revalidatePath("/dashboard/cashbook");
    revalidatePath("/dashboard/cash-drawer");
    revalidatePath("/dashboard/revenue");
    if (data.customerId) revalidatePath(`/dashboard/customers/${data.customerId}`);
    return { success: true, data: { entryId: entry.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// updateCashbookEntry
// Owner: 任意；非 Owner 員工: 只能改自己的
// ============================================================

export async function updateCashbookEntry(
  entryId: string,
  input: z.infer<typeof updateCashbookEntrySchema>
): Promise<ActionResult<void>> {
  try {
    const user = await requireWritablePermission("cashbook.create");
    const data = updateCashbookEntrySchema.parse(input);

    const entry = await prisma.cashbookEntry.findUnique({
      where: { id: entryId },
    });
    if (!entry) throw new AppError("NOT_FOUND", "現金帳紀錄不存在");
    assertStoreAccess(user, entry.storeId);
    if (entry.id.startsWith("inventory:")) throw new AppError("BUSINESS_RULE", "此為進銷存連動款項，不能單獨修改或刪除現金帳。");
    if (entry.id.startsWith("course-rental:") || entry.id.startsWith("course-rental-void:") || entry.id.startsWith("course-profit:") || entry.id.startsWith("course-profit-void:") || entry.id.startsWith("course-fee:") || entry.id.startsWith("course-fee-void:") || entry.id.startsWith("course-trial:") || entry.id.startsWith("course-trial-void:") || entry.id.startsWith("course-purchase:") || (entry.id.startsWith("course-refund:") || entry.id.startsWith("course-void:")))
      throw new AppError("BUSINESS_RULE", "此為課程購買／退款連動紀錄，請由營運交易工作台處理，不能單獨修改現金帳。");

    const effectivePaymentMethod = data.paymentMethod ?? entry.paymentMethod;
    const involvesCash = effectivePaymentMethod === "CASH" || entry.paymentMethod === "CASH";

    const effectiveType = data.type ?? entry.type;
    const effectiveCustomerId = data.customerId === undefined ? entry.customerId : data.customerId;
    if (effectiveCustomerId && effectiveType !== "INCOME") {
      throw new AppError("VALIDATION", "只有收入可以關聯顧客");
    }
    if (data.customerId) {
      const customer = await prisma.customer.findFirst({
        where: {
          id: data.customerId,
          storeId: entry.storeId,
          mergedIntoCustomerId: null,
          NOT: { user: { is: { status: "SUSPENDED" } } },
        },
        select: { id: true },
      });
      if (!customer) {
        throw new AppError("VALIDATION", "找不到這位顧客，請重新選擇");
      }
    }

    // 非 Owner 員工只能修改自己的紀錄
    if (user.role !== "ADMIN") {
      if (!user.staffId || entry.staffId !== user.staffId) {
        throw new AppError("FORBIDDEN", "無法修改其他員工的現金帳紀錄");
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.entryDate !== undefined) updateData.entryDate = parseTaiwanDateToDbDate(data.entryDate);
    if (data.type !== undefined) updateData.type = data.type;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.paymentMethod !== undefined) updateData.paymentMethod = data.paymentMethod;
    if (data.staffId !== undefined) {
      // 非 Owner 員工不能改 staffId（鎖定自己），只有 Owner 可指派
      if (user.role === "ADMIN") updateData.staffId = data.staffId;
    }
    if (data.customerId !== undefined) updateData.customerId = data.customerId;
    if (data.note !== undefined) updateData.note = data.note;

    await prisma.$transaction(async (tx) => {
      if (involvesCash) {
        const dates = [...new Set([entry.entryDate.toISOString().slice(0, 10), data.entryDate].filter((d): d is string => !!d))].sort();
        for (const date of dates) await guardCashDay(tx, entry.storeId, parseTaiwanDateToDbDate(date), data.confirmClosedCashbookChange);
      }
      const updated = await tx.cashbookEntry.update({ where: { id: entryId, updatedAt: entry.updatedAt }, data: updateData });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorNameSnapshot: user.name,
          storeId: entry.storeId,
          module: "SHARED",
          targetType: "CashbookEntry",
          targetId: entryId,
          action: "UPDATE",
          summary: "修改現金收支",
          beforeJson: cashbookSnapshot(entry),
          afterJson: cashbookSnapshot(updated),
        },
      });
    });

    revalidatePath("/dashboard/cashbook");
    revalidatePath("/dashboard/cash-drawer");
    revalidatePath("/dashboard/revenue");
    if (entry.customerId) revalidatePath(`/dashboard/customers/${entry.customerId}`);
    if (data.customerId) revalidatePath(`/dashboard/customers/${data.customerId}`);
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// deleteCashbookEntry — Owner only
// ============================================================

export async function deleteCashbookEntry(entryId: string): Promise<ActionResult<void>> {
  try {
    const user = await requireWritablePermission("cashbook.create"); // Owner 才能刪

    const entry = await prisma.cashbookEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new AppError("NOT_FOUND", "現金帳紀錄不存在");
    assertStoreAccess(user, entry.storeId);
    if (entry.id.startsWith("inventory:")) throw new AppError("BUSINESS_RULE", "此為進銷存連動款項，不能單獨修改或刪除現金帳。");
    if (entry.id.startsWith("course-rental:") || entry.id.startsWith("course-rental-void:") || entry.id.startsWith("course-profit:") || entry.id.startsWith("course-profit-void:") || entry.id.startsWith("course-fee:") || entry.id.startsWith("course-fee-void:") || entry.id.startsWith("course-trial:") || entry.id.startsWith("course-trial-void:") || entry.id.startsWith("course-purchase:") || (entry.id.startsWith("course-refund:") || entry.id.startsWith("course-void:")))
      throw new AppError("BUSINESS_RULE", "此為課程購買／退款連動紀錄，請由營運交易工作台處理，不能單獨修改現金帳。");

    await prisma.$transaction(async (tx) => {
      if (entry.paymentMethod === "CASH") await lockCashDay(tx, entry.storeId, entry.entryDate);
      await tx.cashbookEntry.delete({ where: { id: entryId, updatedAt: entry.updatedAt } });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorNameSnapshot: user.name,
          storeId: entry.storeId,
          module: "SHARED",
          targetType: "CashbookEntry",
          targetId: entryId,
          action: "DELETE",
          summary: "刪除現金收支",
          beforeJson: cashbookSnapshot(entry),
        },
      });
    });

    revalidatePath("/dashboard/cashbook");
    revalidatePath("/dashboard/cash-drawer");
    revalidatePath("/dashboard/revenue");
    if (entry.customerId) revalidatePath(`/dashboard/customers/${entry.customerId}`);
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
