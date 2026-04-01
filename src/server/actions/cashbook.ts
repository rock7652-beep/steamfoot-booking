"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { AppError, handleActionError } from "@/lib/errors";
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
// Owner / Manager（Manager 只能為自己名下建立）
// ============================================================

export async function createCashbookEntry(
  input: z.infer<typeof createCashbookEntrySchema>
): Promise<ActionResult<{ entryId: string }>> {
  try {
    const user = await requireStaffSession();
    const data = createCashbookEntrySchema.parse(input);

    // Manager 若未指定 staffId，自動綁定自己
    let staffId = data.staffId ?? null;
    if (user.role === "MANAGER") {
      // Manager 只能建立歸屬於自己的現金帳紀錄
      staffId = user.staffId ?? null;
    }

    const entry = await prisma.cashbookEntry.create({
      data: {
        entryDate: new Date(data.entryDate + "T00:00:00"),
        type: data.type as CashbookEntryType,
        category: data.category ?? null,
        amount: data.amount,
        staffId,
        note: data.note ?? null,
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
// Owner: 任意；Manager: 只能改自己的
// ============================================================

export async function updateCashbookEntry(
  entryId: string,
  input: z.infer<typeof updateCashbookEntrySchema>
): Promise<ActionResult<void>> {
  try {
    const user = await requireStaffSession();
    const data = updateCashbookEntrySchema.parse(input);

    const entry = await prisma.cashbookEntry.findUnique({
      where: { id: entryId },
    });
    if (!entry) throw new AppError("NOT_FOUND", "現金帳紀錄不存在");

    // Manager 只能修改自己的紀錄
    if (user.role === "MANAGER") {
      if (!user.staffId || entry.staffId !== user.staffId) {
        throw new AppError("FORBIDDEN", "無法修改其他店長的現金帳紀錄");
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.entryDate !== undefined) updateData.entryDate = new Date(data.entryDate + "T00:00:00");
    if (data.type !== undefined) updateData.type = data.type;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.staffId !== undefined) {
      // Manager 不能改 staffId（鎖定自己）
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
    await requireStaffSession(); // Owner 才能刪

    const entry = await prisma.cashbookEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new AppError("NOT_FOUND", "現金帳紀錄不存在");

    await prisma.cashbookEntry.delete({ where: { id: entryId } });

    revalidatePath("/dashboard/cashbook");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
