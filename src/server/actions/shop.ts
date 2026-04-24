"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { revalidateDutyScheduling, revalidateShopConfig } from "@/lib/revalidation";
import type { PricingPlan } from "@prisma/client";
import type { ActionResult } from "@/types";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { updateTag, revalidatePath } from "next/cache";

export async function updateDutyScheduling(
  enabled: boolean
): Promise<ActionResult<void>> {
  try {
    await requireAdminSession();

    await prisma.shopConfig.upsert({
      where: { storeId: DEFAULT_STORE_ID },
      create: { storeId: DEFAULT_STORE_ID, dutySchedulingEnabled: enabled },
      update: { dutySchedulingEnabled: enabled },
    });

    revalidateDutyScheduling();
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "操作失敗" };
  }
}

// ============================================================
// PricingPlan — Store.plan 管理
// ============================================================

const VALID_PRICING_PLANS: PricingPlan[] = ["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"];

export async function updateStorePlan(
  storeId: string,
  plan: PricingPlan
): Promise<ActionResult<void>> {
  try {
    await requireAdminSession();

    if (!VALID_PRICING_PLANS.includes(plan)) {
      return { success: false, error: "無效的方案" };
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return { success: false, error: "店舖不存在" };
    }

    await prisma.store.update({
      where: { id: storeId },
      data: { plan },
    });

    updateTag("store-plan");
    revalidatePath("/dashboard/settings/plan");
    revalidateShopConfig();
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "操作失敗" };
  }
}

// ============================================================
// updateShopBankInfo — PR-5
//
// 店長可設定 ShopConfig 的 4 個前台購買資訊欄位：
//   - bankName / bankCode / bankAccountNumber：顧客轉帳使用
//   - lineOfficialUrl：LINE@ 跳轉連結
//
// 權限：plans.edit（OWNER + PARTNER 皆有；和「方案設定」同層級）
// Upsert 模式：首次儲存時建立 ShopConfig row；之後只更新本次 4 欄
// 空字串視為 null（方便 UI 清空）
// ============================================================

const updateShopBankInfoSchema = z.object({
  bankName: z.string().max(100).nullable().optional(),
  bankCode: z.string().max(20).nullable().optional(),
  bankAccountNumber: z.string().max(50).nullable().optional(),
  lineOfficialUrl: z.string().max(500).nullable().optional(),
});

export async function updateShopBankInfo(
  input: z.infer<typeof updateShopBankInfoSchema>
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("plans.edit");
    const data = updateShopBankInfoSchema.parse(input);
    const storeId = user.storeId;
    if (!storeId) throw new AppError("FORBIDDEN", "使用者未綁定店別");

    const clean = {
      bankName: data.bankName?.trim() || null,
      bankCode: data.bankCode?.trim() || null,
      bankAccountNumber: data.bankAccountNumber?.trim() || null,
      lineOfficialUrl: data.lineOfficialUrl?.trim() || null,
    };

    await prisma.shopConfig.upsert({
      where: { storeId },
      create: { storeId, ...clean },
      update: clean,
    });

    revalidateShopConfig();
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/settings/payment");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
