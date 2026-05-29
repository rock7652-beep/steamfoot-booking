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
import { isBusinessDateClosed } from "@/server/queries/cash-drawer";

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
  // PR-4：當 entryDate 對應的現金抽屜已閉店、且為現金收付時，必須帶 true 明確確認。
  // 純防呆旗標，不寫入 DB；確認後仍不會回頭重算已閉店快照。
  confirmClosedCashbookChange: z.boolean().optional(),
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
  // PR-4：見 createCashbookEntrySchema 同名欄位說明。
  confirmClosedCashbookChange: z.boolean().optional(),
});

// PR-4：把 "YYYY-MM-DD" 轉成 UTC 午夜 Date，對齊 CashDrawerSession.businessDate（@db.Date）。
function businessDateFromStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const CLOSED_CASHBOOK_GUARD_MSG =
  "這一天已經閉店結帳了。新增或修改只是補紀錄，不會改變當天的結帳金額，請確認後再送出。";

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
    const storeId = currentStoreId(user);

    // PR-4 防呆 guard（後端權威，不只靠前端）：
    // 只在現金收付（CASH）時才需要知道該日抽屜是否已 CLOSED（OTHER 不影響抽屜）。
    // 已閉店 + CASH + 未確認 → 拒絕；已閉店 + CASH + 已確認 → 放行但標記為敏感操作（需留痕）。
    let auditClosedCashCreate = false;
    if (data.paymentMethod === "CASH") {
      const closed = await isBusinessDateClosed(storeId, businessDateFromStr(data.entryDate));
      if (closed) {
        if (!data.confirmClosedCashbookChange) {
          throw new AppError("BUSINESS_RULE", CLOSED_CASHBOOK_GUARD_MSG);
        }
        auditClosedCashCreate = true;
      }
    }

    // 非 Owner 員工若未指定 staffId，自動綁定自己
    let staffId = data.staffId || null;
    if (user.role !== "ADMIN") {
      // 非 Owner 員工只能建立歸屬於自己的現金帳紀錄
      staffId = user.staffId ?? null;
    }

    const createData = {
      entryDate: new Date(data.entryDate + "T00:00:00"),
      type: data.type as CashbookEntryType,
      category: data.category || null,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      staffId,
      note: data.note || null,
      createdByUserId: user.id,
      storeId,
    };

    // 一般 create 不寫 audit（維持既有行為，不擴大範圍）；
    // 僅「已閉店日 + CASH + 已確認」這個敏感路徑留痕（beforeJson 為 null，afterJson 用 snapshot）。
    let entry;
    if (auditClosedCashCreate) {
      entry = await prisma.$transaction(async (tx) => {
        const created = await tx.cashbookEntry.create({ data: createData });
        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            targetType: "CashbookEntry",
            targetId: created.id,
            action: "CREATE",
            afterJson: cashbookSnapshot(created),
          },
        });
        return created;
      });
    } else {
      entry = await prisma.cashbookEntry.create({ data: createData });
    }

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

    // PR-4 防呆 guard（後端權威）：
    // 若編輯涉及現金（既有或更新後任一為 CASH），且涉及的營業日（既有日期或新日期）
    // 已 CLOSED，但未明確確認 → 拒絕。OTHER↔OTHER 不涉現金，不擋。
    const effectivePaymentMethod = data.paymentMethod ?? entry.paymentMethod;
    const involvesCash =
      effectivePaymentMethod === "CASH" || entry.paymentMethod === "CASH";
    if (involvesCash && !data.confirmClosedCashbookChange) {
      const datesToCheck = new Set<string>();
      datesToCheck.add(entry.entryDate.toISOString().slice(0, 10));
      if (data.entryDate) datesToCheck.add(data.entryDate);
      let anyClosed = false;
      for (const ds of datesToCheck) {
        if (await isBusinessDateClosed(entry.storeId, businessDateFromStr(ds))) {
          anyClosed = true;
          break;
        }
      }
      if (anyClosed) {
        throw new AppError("BUSINESS_RULE", CLOSED_CASHBOOK_GUARD_MSG);
      }
    }

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
