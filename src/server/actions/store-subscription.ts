"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { parseTaiwanDateToDbDate, addTaiwanDuration } from "@/lib/date-utils";
import type { ActionResult } from "@/types";

/**
 * 店家訂閱管理 — 建立 / 編輯 StoreSubscription（第一版）
 *
 * 原則（docs/store-subscription-planning.md v2）：
 *   - 只寫 StoreSubscription，**完全不碰 Store.plan / currentSubscriptionId**（不動既有方案判斷）
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

    if (data.subscriptionId) {
      // 編輯：確認該訂閱屬於此店
      const existing = await prisma.storeSubscription.findUnique({
        where: { id: data.subscriptionId },
        select: { id: true, storeId: true },
      });
      if (!existing || existing.storeId !== data.storeId) {
        throw new AppError("NOT_FOUND", "訂閱紀錄不存在");
      }
      await prisma.storeSubscription.update({
        where: { id: data.subscriptionId },
        data: { ...common, updatedBy: user.id },
      });
      revalidatePath("/hq/dashboard/stores/subscriptions");
      return { success: true, data: { id: data.subscriptionId } };
    }

    // 建立：只 insert StoreSubscription，不動 Store
    const created = await prisma.storeSubscription.create({
      data: {
        storeId: data.storeId,
        ...common,
        createdBy: user.id,
        updatedBy: user.id,
      },
      select: { id: true },
    });
    revalidatePath("/hq/dashboard/stores/subscriptions");
    return { success: true, data: { id: created.id } };
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
  storeId: z.string().min(1),
  plan: z.enum(["BASIC", "GROWTH", "ALLIANCE", "EXPERIENCE"]),
  startDate: z.string().regex(DATE_RE, "開始日格式須為 YYYY-MM-DD"),
  trialDays: z.union([
    z.literal(3),
    z.literal(7),
    z.literal(14),
    z.literal(30),
  ]),
});

/**
 * HQ 替店家建立一筆 TRIAL 訂閱（MVP）。
 *   - status=TRIAL / isTrial=true / billingStatus=NOT_REQUIRED（體驗免收）
 *   - expiresAt = startDate + trialDays − 1 天（最後一天仍可使用）
 *   - 只寫 StoreSubscription，不碰 Store.plan / UpgradeRequest / 金流
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

    const store = await prisma.store.findUnique({
      where: { id: data.storeId },
      select: { id: true },
    });
    if (!store) throw new AppError("NOT_FOUND", "店舖不存在");

    const startedAt = parseTaiwanDateToDbDate(data.startDate);
    // 到期日 = 開始日 + 天數 − 1（含開始當天）
    const expiresStr = addTaiwanDuration(data.startDate, data.trialDays - 1, "DAY");
    const expiresAt = parseTaiwanDateToDbDate(expiresStr);

    const created = await prisma.storeSubscription.create({
      data: {
        storeId: data.storeId,
        plan: data.plan,
        status: "TRIAL",
        isTrial: true,
        billingCycle: null,
        startedAt,
        expiresAt,
        billingStatus: "NOT_REQUIRED",
        paymentMethod: null,
        priceAmount: null,
        note: `體驗 ${data.trialDays} 天`,
        createdBy: user.id,
        updatedBy: user.id,
      },
      select: { id: true },
    });
    revalidatePath("/hq/dashboard/stores/subscriptions");
    return { success: true, data: { id: created.id } };
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
