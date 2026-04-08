"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { assignPlanSchema } from "@/lib/validators/plan";
import type { ActionResult } from "@/types";
import type { z } from "zod";
import { addDays } from "date-fns";

// ============================================================
// assignPlanToCustomer
// Owner: 任意顧客
// Manager: 自己名下顧客
// 邏輯：建立錢包 + 交易，更新顧客 stage / selfBookingEnabled
// ============================================================

export async function assignPlanToCustomer(
  input: z.infer<typeof assignPlanSchema>
): Promise<ActionResult<{ walletId: string; transactionId: string }>> {
  try {
    const user = await requirePermission("wallet.create");
    const data = assignPlanSchema.parse(input);

    // 取顧客
    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

    // Manager 可為任何顧客購課（含未派任店長的顧客）
    // 不再強制 assignedStaffId === user.staffId

    // 取方案
    const plan = await prisma.servicePlan.findUnique({
      where: { id: data.planId, isActive: true },
    });
    if (!plan) throw new AppError("NOT_FOUND", "課程方案不存在或已停用");

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
      // 1. 建立課程錢包（快照購買時的價格）
      const wallet = await tx.customerPlanWallet.create({
        data: {
          customerId: data.customerId,
          planId: data.planId,
          purchasedPrice: plan.price,          // 快照：不受日後改價影響
          totalSessions: plan.sessionCount,
          remainingSessions: plan.sessionCount,
          startDate,
          expiryDate,
          status: "ACTIVE",
        },
      });

      // 2. 建立交易紀錄（快照 revenueStaffId + soldByStaffId）
      const transaction = await tx.transaction.create({
        data: {
          customerId: data.customerId,
          revenueStaffId: customer.assignedStaffId ?? user.staffId!, // 快照：fallback 到操作者
          soldByStaffId: user.staffId ?? null, // 紀錄本次操作/成交店長
          transactionType: txType,
          paymentMethod: data.paymentMethod,
          amount: plan.price,
          customerPlanWalletId: wallet.id,
          note: data.note,
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

    // 建立調整交易紀錄
    const customer = await prisma.customer.findUnique({
      where: { id: wallet.customerId },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

    const diff = newRemaining - wallet.remainingSessions;

    await prisma.$transaction(async (tx) => {
      await tx.customerPlanWallet.update({
        where: { id: walletId },
        data: {
          remainingSessions: newRemaining,
          status: newRemaining === 0 ? "USED_UP" : "ACTIVE",
        },
      });

      // 建立調整交易紀錄（amount = 0，僅記錄）
      await tx.transaction.create({
        data: {
          customerId: wallet.customerId,
          revenueStaffId: customer.assignedStaffId ?? user.staffId!,
          soldByStaffId: user.staffId ?? null,
          transactionType: "ADJUSTMENT",
          paymentMethod: "CASH",
          amount: 0,
          quantity: diff,
          customerPlanWalletId: walletId,
          note: note ?? `手動調整：${wallet.remainingSessions} → ${newRemaining} 堂`,
        },
      });
    });

    revalidatePath(`/dashboard/customers/${wallet.customerId}`);
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
