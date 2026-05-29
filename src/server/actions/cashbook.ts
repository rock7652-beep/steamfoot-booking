"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { checkCurrentStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import type { ActionResult } from "@/types";
import type { CashbookEntryType } from "@prisma/client";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { currentStoreId } from "@/lib/store";

// ============================================================
// Validators
// ============================================================

// 付款方式：強制明選（無預設）。CASH = 實際收付現金；OTHER = 匯款 / 轉帳 / 非現金。
const paymentMethodSchema = z.enum(["CASH", "OTHER"], {
  errorMap: () => ({ message: "請選擇付款方式（現金 / 其他）" }),
});

const createCashbookEntrySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必須為 YYYY-MM-DD"),
  type: z.enum(["INCOME", "EXPENSE", "WITHDRAW", "ADJUSTMENT"]),
  category: z.string().optional(),
  amount: z.number().positive("金額必須大於 0"),
  paymentMethod: paymentMethodSchema,
  staffId: z.string().optional(),
  note: z.string().optional(),
});

const updateCashbookEntrySchema = z.object({
  entryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必須為 YYYY-MM-DD")
    .optional(),
  type: z.enum(["INCOME", "EXPENSE", "WITHDRAW", "ADJUSTMENT"]).optional(),
  category: z.string().optional(),
  amount: z.number().positive("金額必須大於 0").optional(),
  paymentMethod: paymentMethodSchema.optional(),
  staffId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

// 現金帳稽核快照（寫入 AuditLog.beforeJson / afterJson；不新增任何 schema）
function cashbookSnapshot(e: {
  entryDate: Date;
  type: string;
  category: string | null;
  amount: unknown;
  paymentMethod: string;
  staffId: string | null;
  note: string | null;
}) {
  return {
    entryDate: e.entryDate.toISOString(),
    type: e.type,
    category: e.category,
    amount: Number(e.amount),
    paymentMethod: e.paymentMethod,
    staffId: e.staffId,
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
    const user = await requirePermission("cashbook.create");
    await checkCurrentStoreFeature(FEATURES.CASHBOOK);
    const data = createCashbookEntrySchema.parse(input);

    // 非 Owner 員工若未指定 staffId，自動綁定自己
    let staffId = data.staffId || null;
    if (user.role !== "ADMIN") {
      // 非 Owner 員工只能建立歸屬於自己的現金帳紀錄
      staffId = user.staffId ?? null;
    }

    const entry = await prisma.cashbookEntry.create({
      data: {
        entryDate: new Date(data.entryDate + "T00:00:00"),
        type: data.type as CashbookEntryType,
        category: data.category || null,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        staffId,
        note: data.note || null,
        createdByUserId: user.id,
        storeId: currentStoreId(user),
      },
    });

    revalidatePath("/dashboard/cashbook");
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
    const user = await requirePermission("cashbook.create");
    const data = updateCashbookEntrySchema.parse(input);

    const entry = await prisma.cashbookEntry.findUnique({
      where: { id: entryId },
    });
    if (!entry) throw new AppError("NOT_FOUND", "現金帳紀錄不存在");
    assertStoreAccess(user, entry.storeId);

    // 非 Owner 員工只能修改自己的紀錄
    if (user.role !== "ADMIN") {
      if (!user.staffId || entry.staffId !== user.staffId) {
        throw new AppError("FORBIDDEN", "無法修改其他員工的現金帳紀錄");
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.entryDate !== undefined) updateData.entryDate = new Date(data.entryDate + "T00:00:00");
    if (data.type !== undefined) updateData.type = data.type;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.paymentMethod !== undefined) updateData.paymentMethod = data.paymentMethod;
    if (data.staffId !== undefined) {
      // 非 Owner 員工不能改 staffId（鎖定自己），只有 Owner 可指派
      if (user.role === "ADMIN") updateData.staffId = data.staffId;
    }
    if (data.note !== undefined) updateData.note = data.note;

    await prisma.$transaction(async (tx) => {
      const updated = await tx.cashbookEntry.update({ where: { id: entryId }, data: updateData });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          targetType: "CashbookEntry",
          targetId: entryId,
          action: "UPDATE",
          beforeJson: cashbookSnapshot(entry),
          afterJson: cashbookSnapshot(updated),
        },
      });
    });

    revalidatePath("/dashboard/cashbook");
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
    const user = await requirePermission("cashbook.create"); // Owner 才能刪

    const entry = await prisma.cashbookEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new AppError("NOT_FOUND", "現金帳紀錄不存在");
    assertStoreAccess(user, entry.storeId);

    await prisma.$transaction(async (tx) => {
      await tx.cashbookEntry.delete({ where: { id: entryId } });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          targetType: "CashbookEntry",
          targetId: entryId,
          action: "DELETE",
          beforeJson: cashbookSnapshot(entry),
        },
      });
    });

    revalidatePath("/dashboard/cashbook");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
