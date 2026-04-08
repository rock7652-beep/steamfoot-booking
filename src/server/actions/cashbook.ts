"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { requireFeature } from "@/lib/shop-config";
import { FEATURES } from "@/lib/shop-plan";
import type { ActionResult } from "@/types";
import type { CashbookEntryType } from "@prisma/client";

// ============================================================
// Validators
// ============================================================

const createCashbookEntrySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必須為 YYYY-MM-DD"),
  type: z.enum(["INCOME", "EXPENSE", "WITHDRAW", "ADJUSTMENT"]),
  category: z.string().optional(),
  amount: z.number().positive("金額必須大於 0"),
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
  staffId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

// ============================================================
// createCashbookEntry
// Owner / Staff（非 Owner 員工只能為自己名下建立）
// ============================================================

export async function createCashbookEntry(
  input: z.infer<typeof createCashbookEntrySchema>
): Promise<ActionResult<{ entryId: string }>> {
  try {
    const user = await requirePermission("cashbook.create");
    await requireFeature(FEATURES.CASHBOOK);
    const data = createCashbookEntrySchema.parse(input);

    // 非 Owner 員工若未指定 staffId，自動綁定自己
    let staffId = data.staffId || null;
    if (user.role !== "OWNER") {
      // 非 Owner 員工只能建立歸屬於自己的現金帳紀錄
      staffId = user.staffId ?? null;
    }

    const entry = await prisma.cashbookEntry.create({
      data: {
        entryDate: new Date(data.entryDate + "T00:00:00"),
        type: data.type as CashbookEntryType,
        category: data.category || null,
        amount: data.amount,
        staffId,
        note: data.note || null,
        createdByUserId: user.id,
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

    // 非 Owner 員工只能修改自己的紀錄
    if (user.role !== "OWNER") {
      if (!user.staffId || entry.staffId !== user.staffId) {
        throw new AppError("FORBIDDEN", "無法修改其他員工的現金帳紀錄");
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.entryDate !== undefined) updateData.entryDate = new Date(data.entryDate + "T00:00:00");
    if (data.type !== undefined) updateData.type = data.type;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.staffId !== undefined) {
      // 非 Owner 員工不能改 staffId（鎖定自己），只有 Owner 可指派
      if (user.role === "OWNER") updateData.staffId = data.staffId;
    }
    if (data.note !== undefined) updateData.note = data.note;

    await prisma.cashbookEntry.update({ where: { id: entryId }, data: updateData });

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
    await requirePermission("cashbook.create"); // Owner 才能刪

    const entry = await prisma.cashbookEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new AppError("NOT_FOUND", "現金帳紀錄不存在");

    await prisma.cashbookEntry.delete({ where: { id: entryId } });

    revalidatePath("/dashboard/cashbook");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
