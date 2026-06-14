"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { parseTaiwanDateToDbDate } from "@/lib/date-utils";
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
    // 後端權限：僅 ADMIN / OWNER
    const user = await requireStaffSession();
    if (user.role !== "ADMIN" && user.role !== "OWNER") {
      throw new AppError("FORBIDDEN", "此功能僅限店長或系統管理者");
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
      revalidatePath("/dashboard/settings/store-subscriptions");
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
    revalidatePath("/dashboard/settings/store-subscriptions");
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
