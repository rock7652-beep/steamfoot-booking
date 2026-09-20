"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/permissions";
import { openSingleStoreTrial } from "@/server/services/single-store-trial";
import { revalidateStorePlan, revalidateShopConfig } from "@/lib/revalidation";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { parseTaiwanDateToDbDate, toLocalDateStr, parseTaipeiDateTime } from "@/lib/date-utils";
import type { ActionResult } from "@/types";

/**
 * 店家訂閱管理 — 建立 / 編輯 StoreSubscription（第一版）
 *
 * 原則（docs/store-subscription-planning.md v2）：
 *   - 正式啟用同步 Store.plan / currentSubscriptionId；歷史訂閱編輯不影響現行方案
 *   - 不碰 UpgradeRequest 流程、不自動停權、不接金流
 *   - createdBy / updatedBy 寫入操作者（userId）
 *   - 權限：後端強制 ADMIN / OWNER（不只前端隱藏）
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const upsertSchema = z.object({
  subscriptionId: z.string().min(1).optional(),
  storeId: z.string().min(1),
  plan: z.enum(["BASIC", "GROWTH", "ALLIANCE", "EXPERIENCE"]),
  status: z.enum([
    "TRIAL",
    "ACTIVE",
    "PAYMENT_PENDING",
    "PAST_DUE",
    "CANCELLED",
    "EXPIRED",
  ]),
  billingCycle: z.enum(["MONTHLY", "YEARLY"]),
  startedAt: z.string().regex(DATE_RE, "起始日格式須為 YYYY-MM-DD"),
  effectiveAt: z.string().regex(DATE_RE).optional().or(z.literal("")),
  expiresAt: z.string().regex(DATE_RE).optional().or(z.literal("")),
  billingStatus: z.enum([
    "NOT_REQUIRED",
    "PENDING",
    "PAID",
    "FAILED",
    "REFUNDED",
    "WAIVED",
  ]),
  paymentMethod: z
    .enum(["CASH", "BANK_TRANSFER", "CREDIT_CARD"])
    .optional()
    .or(z.literal("")),
  priceAmount: z.number().int().nonnegative().nullable().optional(),
  note: z.string().max(1000).optional().or(z.literal("")),
});

export async function upsertStoreSubscription(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    // 跨店訂閱管理為 HQ 專用 → 後端僅限 ADMIN（不只前端隱藏）
    const user = await requireStaffSession();
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "此功能僅限總部管理者");
    }

    const data = upsertSchema.parse(input);

    const store = await prisma.store.findUnique({
      where: { id: data.storeId },
      select: { id: true },
    });
    if (!store) throw new AppError("NOT_FOUND", "店舖不存在");

    for (const date of [data.startedAt, data.effectiveAt, data.expiresAt].filter(Boolean)) {
      if (!parseTaipeiDateTime(date!, "00:00")) throw new AppError("VALIDATION", "日期無效");
    }
    if (data.status === "ACTIVE" && (data.effectiveAt || data.startedAt) > toLocalDateStr()) throw new AppError("VALIDATION", "正式啟用日期不可晚於今天");
    if (data.expiresAt && data.expiresAt < (data.effectiveAt || data.startedAt)) throw new AppError("VALIDATION", "到期日不可早於開始日");
    const startedAt = parseTaiwanDateToDbDate(data.startedAt);
    const effectiveAt = data.effectiveAt
      ? parseTaiwanDateToDbDate(data.effectiveAt)
      : null;
    const expiresAt = data.expiresAt
      ? parseTaiwanDateToDbDate(data.expiresAt)
      : null;
    const paymentMethod = data.paymentMethod ? data.paymentMethod : null;
    const note = data.note && data.note.trim() ? data.note.trim() : null;
    const priceAmount = data.priceAmount ?? null;

    const common = {
      plan: data.plan,
      status: data.status,
      billingCycle: data.billingCycle,
      startedAt,
      effectiveAt,
      expiresAt,
      billingStatus: data.billingStatus,
      paymentMethod,
      priceAmount,
      note,
    };

    await requirePermission("staff.manage");
    if (data.status === "TRIAL") throw new AppError("VALIDATION", "請使用開通試用入口設定試用或延長天數");
    if (data.status === "ACTIVE" && data.plan === "EXPERIENCE") throw new AppError("VALIDATION", "轉正式請選基本版、專業版或展店版");
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`subscription:${data.storeId}`}, 0))`;
      const currentStore = await tx.store.findUniqueOrThrow({ where: { id: data.storeId } });
      const existing = data.subscriptionId ? await tx.storeSubscription.findUnique({ where: { id: data.subscriptionId } }) : null;
      if (data.subscriptionId && (!existing || existing.storeId !== data.storeId)) throw new AppError("NOT_FOUND", "訂閱紀錄不存在");
      const saved = existing
        ? await tx.storeSubscription.update({ where: { id: existing.id }, data: { ...common, isTrial: false, updatedBy: user.id } })
        : await tx.storeSubscription.create({ data: { storeId: data.storeId, ...common, isTrial: false, createdBy: user.id, updatedBy: user.id } });
      // Historical edits never replace a newer current subscription.
      const isCurrent = !existing || !currentStore.currentSubscriptionId || currentStore.currentSubscriptionId === existing.id;
      if (isCurrent && data.status === "ACTIVE") {
        if (currentStore.currentSubscriptionId && currentStore.currentSubscriptionId !== saved.id) await tx.storeSubscription.update({ where: { id: currentStore.currentSubscriptionId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
        await tx.store.update({ where: { id: data.storeId }, data: {
          plan: data.plan, planStatus: "ACTIVE", planEffectiveAt: effectiveAt ?? startedAt,
          planExpiresAt: expiresAt, currentSubscriptionId: saved.id,
        } });
        await tx.storePlanChange.create({ data: {
          storeId: data.storeId, changeType: "PLAN_ACTIVATED", fromPlan: currentStore.plan, toPlan: data.plan,
          fromStatus: currentStore.planStatus, toStatus: "ACTIVE", subscriptionId: saved.id,
          operatorUserId: user.id, reason: "原店家帳號轉正式／續約，保留營運資料",
        } });
      }
      if (isCurrent && (data.status === "EXPIRED" || data.status === "CANCELLED")) {
        await tx.store.update({ where: { id: data.storeId }, data: { planStatus: data.status } });
      }
      return { id: saved.id };
    });
    revalidateStorePlan();
    revalidateShopConfig();
    revalidatePath("/hq/dashboard/stores/subscriptions");
    return { success: true, data: result };
  } catch (e) {
    if (e instanceof AppError) return { success: false, error: e.message };
    if (e instanceof z.ZodError) {
      return {
        success: false,
        error: "欄位格式有誤：" + e.errors.map((x) => x.message).join("、"),
      };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "操作失敗",
    };
  }
}

// ============================================================
// HQ 體驗（TRIAL）快速建立 — 僅 ADMIN
// ============================================================

const trialSchema = z.object({
  entryAcceptanceConfirmed: z.boolean().default(false),
  storeId: z.string().min(1),
  plan: z.enum(["BASIC", "GROWTH", "ALLIANCE", "EXPERIENCE"]),
  startDate: z.string().regex(DATE_RE, "開始日格式須為 YYYY-MM-DD"),
  // 預設有制度（前端 30 天），天數保留商業彈性：HQ 可自訂 1–90 天
  trialDays: z.number().int().min(1).max(90).default(30),
});

/**
 * HQ 替店家建立一筆 TRIAL 訂閱（MVP）。
 *   - status=TRIAL / isTrial=true / billingStatus=NOT_REQUIRED（體驗免收）
 *   - expiresAt = startDate + trialDays − 1 天（最後一天仍可使用）
 *   - 共用開通服務同步 Store.plan 與到期日，不接金流
 *   - 轉正式方案走既有「編輯訂閱」（改 status=ACTIVE + 付款資訊）
 *   - 權限：後端僅 ADMIN（店長不可建立 Trial）
 */
export async function createTrialSubscription(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireStaffSession();
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "此功能僅限總部管理者");
    }

    const data = trialSchema.parse(input);

    await requirePermission("staff.manage");
    const created = await openSingleStoreTrial({ storeId: data.storeId, actorId: user.id, startDate: data.startDate, days: data.trialDays, entryAcceptanceConfirmed: data.entryAcceptanceConfirmed });
    revalidateStorePlan();
    revalidateShopConfig();
    revalidatePath("/hq/dashboard/stores/subscriptions");
    return { success: true, data: created };
  } catch (e) {
    if (e instanceof AppError) return { success: false, error: e.message };
    if (e instanceof z.ZodError) {
      return {
        success: false,
        error: "欄位格式有誤：" + e.errors.map((x) => x.message).join("、"),
      };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "操作失敗",
    };
  }
}
