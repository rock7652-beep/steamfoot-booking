"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { handleActionError } from "@/lib/errors";
import { revalidateDutyScheduling, revalidateShopConfig } from "@/lib/revalidation";
import type { PricingPlan } from "@prisma/client";
import type { ActionResult } from "@/types";
import { resolveWriteStoreId } from "@/lib/store";
import { parseTaiwanDateToDbDate } from "@/lib/date-utils";
import { updateTag, revalidatePath } from "next/cache";
import { ensureTrialPlan } from "@/server/services/trial-plan";

export async function updateDutyScheduling(
  enabled: boolean
): Promise<ActionResult<void>> {
  try {
    // duty.manage 對齊頁面開放給 ADMIN / OWNER 的範圍。
    // OWNER 用 session.storeId；ADMIN 用 active-store-id cookie（必須是具體店，非 __all__）。
    const user = await requirePermission("duty.manage");
    const storeId = await resolveWriteStoreId(user);

    await prisma.shopConfig.upsert({
      where: { storeId },
      create: { storeId, dutySchedulingEnabled: enabled },
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
    const storeId = await resolveWriteStoreId(user);

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

// ============================================================
// updateTrialSettings — 體驗課設定（體驗客流程 PR-1）
//
// 店長設定 ShopConfig 的 5 個體驗課欄位。權限：trial.manage（預設僅 OWNER）。
// 存檔時順帶 ensureTrialPlan（idempotent；不會改動既有 plan 價格）。
// 不影響既有交易：單筆體驗金額在建立當下快照，預設價調整不回溯。
// ============================================================

const PRICE_CAP = 1_000_000;

const updateTrialSettingsSchema = z
  .object({
    trialEnabled: z.boolean(),
    trialDefaultPrice: z.number().int().min(0).max(PRICE_CAP),
    trialAllowPriceEdit: z.boolean(),
    trialMinPrice: z.number().int().min(0).max(PRICE_CAP),
    trialMaxPrice: z.number().int().min(0).max(PRICE_CAP),
  })
  .refine((d) => d.trialMinPrice <= d.trialMaxPrice, {
    message: "最低價不可大於最高價",
    path: ["trialMinPrice"],
  })
  .refine(
    (d) => d.trialDefaultPrice >= d.trialMinPrice && d.trialDefaultPrice <= d.trialMaxPrice,
    { message: "預設價必須介於最低價與最高價之間", path: ["trialDefaultPrice"] },
  );

export async function updateTrialSettings(
  input: z.infer<typeof updateTrialSettingsSchema>
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("trial.manage");
    const data = updateTrialSettingsSchema.parse(input);
    const storeId = await resolveWriteStoreId(user);

    await prisma.shopConfig.upsert({
      where: { storeId },
      create: { storeId, ...data },
      update: data,
    });

    // 確保該店有 canonical 體驗 ServicePlan（idempotent；不改既有 plan 價格）
    await ensureTrialPlan(storeId, data.trialDefaultPrice);

    revalidateShopConfig();
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/settings/trial");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// updateBookableUntilDate — PR-1 次月預約開放控管
//
// 店長設定顧客自助預約「可預約到日期」（含當日，台灣時間）：
//   - 傳入 "YYYY-MM-DD" → 開放到該日（顧客可訂當日，不可訂隔日）
//   - 傳入 null → 清空，回到預設「今天 +14 天」
//
// 僅限制 role=CUSTOMER 自助預約；後台店長/管理者代約不受此限制。
// 不回溯既有 Booking。權限：business_hours.manage（與「預約開放設定」頁同層級）。
// ============================================================

const updateBookableUntilDateSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式須為 YYYY-MM-DD")
    .nullable(),
});

export async function updateBookableUntilDate(
  input: z.infer<typeof updateBookableUntilDateSchema>
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const { date } = updateBookableUntilDateSchema.parse(input);
    const storeId = await resolveWriteStoreId(user);

    const value = date ? parseTaiwanDateToDbDate(date) : null;

    await prisma.shopConfig.upsert({
      where: { storeId },
      create: { storeId, bookableUntilDate: value },
      update: { bookableUntilDate: value },
    });

    revalidateShopConfig();
    revalidatePath("/dashboard/settings/hours");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

const updateCustomerBookingWindowSchema = z.object({
  opensAt: z.string().datetime({ offset: true }).nullable(),
  days: z.number().int().min(1).max(90),
});

/** 儲存新版顧客預約範圍；不回溯、不修改任何既有預約。 */
export async function updateCustomerBookingWindow(
  input: z.infer<typeof updateCustomerBookingWindowSchema>,
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const { opensAt, days } = updateCustomerBookingWindowSchema.parse(input);
    const storeId = await resolveWriteStoreId(user);
    await prisma.shopConfig.upsert({
      where: { storeId },
      create: {
        storeId,
        bookableUntilDate: null,
        bookingOpensAt: opensAt ? new Date(opensAt) : null,
        bookingWindowDays: days,
      },
      update: {
        bookableUntilDate: null,
        bookingOpensAt: opensAt ? new Date(opensAt) : null,
        bookingWindowDays: days,
      },
    });
    revalidateShopConfig();
    revalidatePath("/dashboard/settings/hours");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
