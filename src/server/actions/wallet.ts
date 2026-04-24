"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission, checkPermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { assignPlanSchema } from "@/lib/validators/plan";
import type { ActionResult } from "@/types";
import type { z } from "zod";
import { addDays } from "date-fns";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { currentStoreId } from "@/lib/store";
import { buildTransactionSnapshot } from "@/lib/transaction-snapshot";
import { awardFirstTopupReferralPointsIfEligible } from "@/server/services/referral-points";

// ============================================================
// 折扣計算
// ============================================================

function calculateFinalAmount(
  originalPrice: number,
  discountType: string,
  discountValue: number | undefined
): number {
  if (discountType === "none" || !discountValue) return originalPrice;

  if (discountType === "fixed") {
    // 固定金額折扣
    const result = originalPrice - discountValue;
    return Math.max(0, Math.round(result));
  }

  if (discountType === "percentage") {
    // 百分比折扣（discountValue = 打幾折，e.g. 80 = 8折）
    const ratio = discountValue / 100;
    const result = originalPrice * ratio;
    return Math.max(0, Math.round(result));
  }

  return originalPrice;
}

// ============================================================
// assignPlanToCustomer
// 同店所有員工皆可為顧客購課
// 邏輯：建立錢包 + 交易，更新顧客 stage / selfBookingEnabled
// ============================================================

export async function assignPlanToCustomer(
  input: z.infer<typeof assignPlanSchema>
): Promise<ActionResult<{ walletId: string; transactionId: string }>> {
  try {
    const user = await requirePermission("wallet.create");
    const data = assignPlanSchema.parse(input);

    // 折扣權限檢查：如果有折扣，需要 transaction.discount 權限
    const hasDiscount = data.discountType && data.discountType !== "none" && data.discountValue;
    if (hasDiscount) {
      const canDiscount = await checkPermission(user.role, user.staffId, "transaction.discount");
      if (!canDiscount) {
        throw new AppError("FORBIDDEN", "您沒有使用折扣的權限");
      }
    }

    // 取顧客
    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
    assertStoreAccess(user, customer.storeId);

    // 取方案（限同店）
    const plan = await prisma.servicePlan.findUnique({
      where: { id: data.planId, isActive: true },
    });
    if (!plan) throw new AppError("NOT_FOUND", "課程方案不存在或已停用");
    if (plan.storeId !== user.storeId) throw new AppError("FORBIDDEN", "無權限使用此方案");

    // 折扣驗證
    const originalPrice = Number(plan.price);
    const discountType = data.discountType ?? "none";
    const discountValue = data.discountValue;

    if (discountType === "fixed" && discountValue && discountValue > originalPrice) {
      throw new AppError("VALIDATION", "折扣金額不可超過原價");
    }
    if (discountType === "percentage" && discountValue && (discountValue < 1 || discountValue > 100)) {
      throw new AppError("VALIDATION", "折扣百分比需在 1-100 之間");
    }

    // 計算實收金額
    const finalAmount = calculateFinalAmount(originalPrice, discountType, discountValue);

    // 決定 transactionType
    const txType =
      plan.category === "TRIAL"
        ? "TRIAL_PURCHASE"
        : plan.category === "SINGLE"
        ? "SINGLE_PURCHASE"
        : "PACKAGE_PURCHASE";

    const now = new Date();
    const startDate = now;
    const expiryDate = plan.validityDays ? addDays(now, plan.validityDays) : null;

    // 使用 Prisma transaction 確保原子性
    const result = await prisma.$transaction(async (tx) => {
      // 1. 建立課程錢包（快照購買時的價格 = 實收金額）
      const wallet = await tx.customerPlanWallet.create({
        data: {
          customerId: data.customerId,
          planId: data.planId,
          purchasedPrice: finalAmount,          // 快照：實收金額
          totalSessions: plan.sessionCount,
          remainingSessions: plan.sessionCount,
          startDate,
          expiryDate,
          status: "ACTIVE",
          storeId: currentStoreId(user),
        },
      });

      // 2. 建立交易紀錄
      const revenueStaffId = customer.assignedStaffId ?? user.staffId!;
      const storeId = currentStoreId(user);

      const snapshot = await buildTransactionSnapshot(tx, {
        customerId: data.customerId,
        storeId,
        revenueStaffId,
        planId: data.planId,
        grossAmount: originalPrice,
        netAmount: finalAmount,
      });

      // TODO(PR-3): paymentMethod === "TRANSFER" 時需顯式傳 paymentStatus: "PENDING"
      // （schema default = SUCCESS 僅為歷史 backfill 安全網；轉帳需店長確認後才能進營收）
      const transaction = await tx.transaction.create({
        data: {
          customerId: data.customerId,
          revenueStaffId, // 快照：營收歸屬
          soldByStaffId: user.staffId ?? null, // 紀錄本次操作/成交店長
          transactionType: txType,
          paymentMethod: data.paymentMethod,
          amount: finalAmount,                    // 實收金額
          originalAmount: hasDiscount ? originalPrice : null,  // 有折扣才記原價
          discountType: hasDiscount ? discountType : null,
          discountValue: hasDiscount ? discountValue : null,
          discountReason: data.discountReason || null,
          customerPlanWalletId: wallet.id,
          note: data.note,
          storeId,
          ...snapshot,
        },
      });

      // 3. 更新顧客狀態
      const isFirstPurchase = !customer.convertedAt;
      await tx.customer.update({
        where: { id: data.customerId },
        data: {
          customerStage: "ACTIVE",
          selfBookingEnabled: true,
          ...(isFirstPurchase && { convertedAt: now }),
        },
      });

      // 🆕 推薦獎勵：首次購課 + 有 sponsor → 邀請者 +15、被邀請者 +5
      // sourceKey 以 customerId 為主鍵；靜默失敗
      await awardFirstTopupReferralPointsIfEligible({
        customerId: data.customerId,
        storeId: currentStoreId(user),
        isFirstPurchase,
        tx,
      });

      return { wallet, transaction };
    });

    revalidatePath(`/dashboard/customers/${data.customerId}`);
    return {
      success: true,
      data: { walletId: result.wallet.id, transactionId: result.transaction.id },
    };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// adjustRemainingSessions — 需要 wallet.adjust 權限（手動補正）
// ============================================================

export async function adjustRemainingSessions(
  walletId: string,
  newRemaining: number,
  note?: string
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("wallet.adjust");

    if (newRemaining < 0) {
      throw new AppError("VALIDATION", "剩餘堂數不可為負數");
    }

    const wallet = await prisma.customerPlanWallet.findUnique({
      where: { id: walletId },
    });
    if (!wallet) throw new AppError("NOT_FOUND", "課程錢包不存在");
    assertStoreAccess(user, wallet.storeId);

    // 建立調整交易紀錄
    const customer = await prisma.customer.findUnique({
      where: { id: wallet.customerId },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

    const diff = newRemaining - wallet.remainingSessions;

    const revenueStaffId = customer.assignedStaffId ?? user.staffId!;
    const storeId = currentStoreId(user);

    await prisma.$transaction(async (tx) => {
      await tx.customerPlanWallet.update({
        where: { id: walletId },
        data: {
          remainingSessions: newRemaining,
          status: newRemaining === 0 ? "USED_UP" : "ACTIVE",
        },
      });

      const snapshot = await buildTransactionSnapshot(tx, {
        customerId: wallet.customerId,
        storeId,
        revenueStaffId,
        planId: null,
        grossAmount: 0,
        netAmount: 0,
      });

      // 建立調整交易紀錄（amount = 0，僅記錄）
      await tx.transaction.create({
        data: {
          customerId: wallet.customerId,
          revenueStaffId,
          soldByStaffId: user.staffId ?? null,
          transactionType: "ADJUSTMENT",
          paymentMethod: "CASH",
          amount: 0,
          quantity: diff,
          customerPlanWalletId: walletId,
          note: note ?? `手動調整：${wallet.remainingSessions} → ${newRemaining} 堂`,
          storeId,
          ...snapshot,
        },
      });
    });

    revalidatePath(`/dashboard/customers/${wallet.customerId}`);
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
