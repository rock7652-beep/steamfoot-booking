"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { prisma } from "@/lib/db";
import {
  mergeCustomerIntoCustomer,
  type CustomerMergeOutcome,
} from "@/server/services/customer-merge";
import type { ActionResult } from "@/types";

// ============================================================
// mergeCustomerAction (Phase 1)
// ============================================================
//
// 後台 /dashboard/customers/merge 把兩筆同人 Customer 合併。
//
// 權限策略（Phase 1）：
//   - 用 customer.update（Phase 2 再考慮 customer.merge）
//   - 額外要求 user.role === "OWNER"（Staff 相關高風險操作的專案慣例）
//   - 兩筆 customer 必須屬於 user 可存取的 store（assertStoreAccess）
//
// 回傳：成功時帶 outcome（搬移筆數 / 合併欄位）；失敗時回 error 字串。

export type MergeCustomerActionInput = {
  sourceCustomerId: string;
  targetCustomerId: string;
};

export async function mergeCustomerAction(
  input: MergeCustomerActionInput,
): Promise<ActionResult<CustomerMergeOutcome>> {
  try {
    const user = await requirePermission("customer.update");

    // Phase 1：高風險操作只開放 OWNER + ADMIN
    // ADMIN 跨店有權；OWNER 為單店店長。PARTNER 即使有 customer.update 也擋下。
    if (user.role !== "OWNER" && user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "顧客合併僅限店長 / 系統管理者執行");
    }

    const sourceId = (input?.sourceCustomerId ?? "").trim();
    const targetId = (input?.targetCustomerId ?? "").trim();

    if (!sourceId || !targetId) {
      throw new AppError("VALIDATION", "請填寫來源與目標顧客 ID");
    }
    if (sourceId === targetId) {
      throw new AppError("VALIDATION", "來源與目標不可相同");
    }

    // Pre-flight：確認兩筆都在 user 可存取的 store
    const [source, target] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: sourceId },
        select: { id: true, storeId: true },
      }),
      prisma.customer.findUnique({
        where: { id: targetId },
        select: { id: true, storeId: true },
      }),
    ]);
    if (!source) throw new AppError("NOT_FOUND", `找不到來源顧客 ${sourceId}`);
    if (!target) throw new AppError("NOT_FOUND", `找不到目標顧客 ${targetId}`);
    assertStoreAccess(user, source.storeId);
    assertStoreAccess(user, target.storeId);

    const outcome = await mergeCustomerIntoCustomer({
      sourceCustomerId: source.id,
      targetCustomerId: target.id,
      performedByUserId: user.id,
    });

    // 列表 + 兩筆 customer 詳情頁全部失效
    revalidatePath("/dashboard/customers");
    revalidatePath(`/dashboard/customers/${target.id}`);
    revalidatePath(`/dashboard/customers/${source.id}`);

    return { success: true, data: outcome };
  } catch (e) {
    return handleActionError(e);
  }
}
