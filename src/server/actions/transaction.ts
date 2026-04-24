"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { checkCurrentStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { revalidateTransactions } from "@/lib/revalidation";
import type { ActionResult } from "@/types";
import type { PaymentMethod, TransactionType } from "@prisma/client";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { currentStoreId } from "@/lib/store";
import { buildTransactionSnapshot, buildRefundSnapshot } from "@/lib/transaction-snapshot";
import { awardFirstTopupReferralPointsIfEligible } from "@/server/services/referral-points";

// ============================================================
// Validators
// ============================================================

const createTransactionSchema = z.object({
  customerId: z.string().min(1),
  bookingId: z.string().optional(),
  customerPlanWalletId: z.string().optional(),
  transactionType: z.enum([
    "TRIAL_PURCHASE",
    "SINGLE_PURCHASE",
    "PACKAGE_PURCHASE",
    "SESSION_DEDUCTION",
    "SUPPLEMENT",
    "REFUND",
    "ADJUSTMENT",
  ]),
  paymentMethod: z
    .enum(["CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD", "OTHER"])
    .default("CASH"),
  amount: z.number(), // 正數=收入，負數=退款/調整
  quantity: z.number().int().optional(),
  note: z.string().optional(),
});

const refundTransactionSchema = z.object({
  amount: z.number().positive("退款金額必須為正數"),
  paymentMethod: z
    .enum(["CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD", "OTHER"])
    .default("CASH"),
  note: z.string().optional(),
});

const adjustmentSchema = z.object({
  customerId: z.string().min(1),
  amount: z.number(),
  note: z.string().min(1, "調整備註不能為空"),
});

// PR-4：確認付款 input（皆 optional；格式驗證留待 UI）
const confirmPaymentSchema = z.object({
  referenceNo: z.string().max(100).optional(),
  bankLast5: z.string().max(10).optional(),
});

// ============================================================
// createTransaction — Owner only（手動補登交易）
//
// 用途：補登漏單、修正歷史、補差額
// Owner 才能手動建立交易；Manager 只能透過業務流程（如 assignPlanToCustomer）
// ============================================================

export async function createTransaction(
  input: z.infer<typeof createTransactionSchema>
): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const user = await requirePermission("transaction.create");
    await checkCurrentStoreFeature(FEATURES.TRANSACTION_MANAGEMENT);
    const data = createTransactionSchema.parse(input);

    // 確認顧客存在
    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, assignedStaffId: true, storeId: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
    assertStoreAccess(user, customer.storeId);

    // 若指定 wallet，確認其存在且屬於該顧客
    if (data.customerPlanWalletId) {
      const wallet = await prisma.customerPlanWallet.findFirst({
        where: { id: data.customerPlanWalletId, customerId: data.customerId },
      });
      if (!wallet) throw new AppError("NOT_FOUND", "課程錢包不存在或不屬於該顧客");
    }

    const revenueStaffId = customer.assignedStaffId ?? user.staffId ?? (() => { throw new AppError("FORBIDDEN", "顧客尚未指派店長，無法建立交易"); })();
    const storeId = currentStoreId(user);
    const amountNum = Math.abs(data.amount);

    const result = await prisma.$transaction(async (txClient) => {
      const snapshot = await buildTransactionSnapshot(txClient, {
        customerId: data.customerId,
        storeId,
        revenueStaffId,
        planId: null,
        grossAmount: amountNum,
        netAmount: amountNum,
      });

      return txClient.transaction.create({
        data: {
          customerId: data.customerId,
          bookingId: data.bookingId ?? null,
          revenueStaffId,
          serviceStaffId: user.staffId ?? null,
          customerPlanWalletId: data.customerPlanWalletId ?? null,
          transactionType: data.transactionType as TransactionType,
          paymentMethod: data.paymentMethod as PaymentMethod,
          amount: data.amount,
          quantity: data.quantity ?? null,
          note: data.note ?? null,
          storeId,
          ...snapshot,
        },
      });
    });

    revalidateTransactions(data.customerId);
    return { success: true, data: { transactionId: result.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// refundTransaction — Owner only
//
// 針對一筆既有交易建立對應的 REFUND 紀錄（負數 amount）
// 不自動修改 wallet；退款後若需調整堂數，用 adjustRemainingSessions
// ============================================================

export async function refundTransaction(
  originalTransactionId: string,
  input: z.infer<typeof refundTransactionSchema>
): Promise<ActionResult<{ refundId: string }>> {
  try {
    const user = await requirePermission("transaction.create");
    const data = refundTransactionSchema.parse(input);

    const original = await prisma.transaction.findUnique({
      where: { id: originalTransactionId },
      include: { customer: { select: { assignedStaffId: true } } },
    });
    if (!original) throw new AppError("NOT_FOUND", "原始交易不存在");
    assertStoreAccess(user, original.storeId);

    if (original.transactionType === "REFUND") {
      throw new AppError("BUSINESS_RULE", "不能對退款交易再次退款");
    }
    if (original.transactionType === "SESSION_DEDUCTION") {
      throw new AppError("BUSINESS_RULE", "扣堂紀錄不適用退款，請改用堂數調整");
    }

    const refundSnapshot = buildRefundSnapshot(original);

    const refund = await prisma.$transaction(async (txClient) => {
      // 更新原始交易狀態 + 累計退款金額
      await txClient.transaction.update({
        where: { id: originalTransactionId },
        data: {
          status: "REFUNDED",
          refundAmount: { increment: data.amount },
        },
      });

      return txClient.transaction.create({
        data: {
          customerId: original.customerId,
          bookingId: original.bookingId ?? null,
          revenueStaffId: original.revenueStaffId, // 維持原始快照
          customerPlanWalletId: original.customerPlanWalletId ?? null,
          transactionType: "REFUND",
          paymentMethod: data.paymentMethod as PaymentMethod,
          amount: -data.amount, // 負數
          note: data.note ? `[退款] ${data.note}` : `[退款] 原交易 ${originalTransactionId}`,
          storeId: currentStoreId(user),
          ...refundSnapshot,
          netAmount: -data.amount,
        },
      });
    });

    revalidateTransactions(original.customerId);
    return { success: true, data: { refundId: refund.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// createAdjustment — Owner only
//
// 手動補差額、調整金額（SUPPLEMENT / ADJUSTMENT）
// ============================================================

export async function createAdjustment(
  input: z.infer<typeof adjustmentSchema>
): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const user = await requirePermission("transaction.create");
    const data = adjustmentSchema.parse(input);

    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, assignedStaffId: true, storeId: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
    assertStoreAccess(user, customer.storeId);

    const revenueStaffId = customer.assignedStaffId ?? user.staffId ?? (() => { throw new AppError("FORBIDDEN", "顧客尚未指派店長，無法建立交易"); })();
    const storeId = currentStoreId(user);
    const amountNum = Math.abs(data.amount);

    const result = await prisma.$transaction(async (txClient) => {
      const snapshot = await buildTransactionSnapshot(txClient, {
        customerId: data.customerId,
        storeId,
        revenueStaffId,
        planId: null,
        grossAmount: amountNum,
        netAmount: amountNum,
      });

      return txClient.transaction.create({
        data: {
          customerId: data.customerId,
          revenueStaffId,
          serviceStaffId: user.staffId ?? null,
          transactionType: data.amount >= 0 ? "SUPPLEMENT" : "ADJUSTMENT",
          paymentMethod: "CASH",
          amount: data.amount,
          note: data.note,
          storeId,
          ...snapshot,
        },
      });
    });

    revalidateTransactions(data.customerId);
    return { success: true, data: { transactionId: result.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// confirmTransactionPayment — PR-4
//
// 店長確認轉帳 / UNPAID 交易入帳：
//   - Guard 1：只允許 paymentMethod ∈ {TRANSFER, UNPAID}
//   - Guard 2：只允許 paymentStatus === PENDING 且 status ∉ {CANCELLED, REFUNDED}
//   - CAS（updateMany WHERE paymentStatus=PENDING）防並行重複確認
//   - 成功 CAS 後才做：customer 升等 + convertedAt + 首儲推薦獎勵
//   - dedup key 沿用 PR-3：first_topup_{referrer,self}:{customerId}
//     → PointRecord @@unique 是第三層保險
//   - 同一 prisma.$transaction 原子性
// ============================================================

export async function confirmTransactionPayment(
  transactionId: string,
  input?: z.infer<typeof confirmPaymentSchema>
): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const user = await requirePermission("transaction.create");
    const data = input ? confirmPaymentSchema.parse(input) : {};

    // Pre-check：讀取原交易 + store 隔離
    const original = await prisma.transaction.findUnique({
      where: { id: transactionId },
      select: {
        id: true,
        storeId: true,
        customerId: true,
        paymentStatus: true,
        paymentMethod: true,
        status: true,
      },
    });
    if (!original) throw new AppError("NOT_FOUND", "交易紀錄不存在");
    assertStoreAccess(user, original.storeId);

    // Guard 1：只有 TRANSFER / UNPAID 可確認
    if (original.paymentMethod !== "TRANSFER" && original.paymentMethod !== "UNPAID") {
      throw new AppError(
        "BUSINESS_RULE",
        `付款方式為 ${original.paymentMethod}，不需要確認付款`
      );
    }

    // Guard 2a：只有 PENDING 可確認
    if (original.paymentStatus !== "PENDING") {
      throw new AppError(
        "BUSINESS_RULE",
        `交易當前付款狀態為 ${original.paymentStatus}，無法確認`
      );
    }

    // Guard 2b：交易生命週期不可為取消 / 退款
    if (original.status === "CANCELLED" || original.status === "REFUNDED") {
      throw new AppError(
        "BUSINESS_RULE",
        `交易狀態為 ${original.status}，無法確認付款`
      );
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // CAS：只有 paymentStatus 仍為 PENDING 時才更新（防並行重複確認）
      const result = await tx.transaction.updateMany({
        where: {
          id: transactionId,
          paymentStatus: "PENDING",
          status: { notIn: ["CANCELLED", "REFUNDED"] },
        },
        data: {
          paymentStatus: "CONFIRMED",
          paidAt: now,
          ...(data.referenceNo !== undefined && { referenceNo: data.referenceNo }),
          ...(data.bankLast5 !== undefined && { bankLast5: data.bankLast5 }),
        },
      });

      if (result.count === 0) {
        // CAS 失敗：被別人搶先確認 / 被取消 / 已退款
        throw new AppError("CONFLICT", "此交易已被確認或狀態已變更，無法重複確認");
      }

      // CAS 成功 → 重現 PR-3 skip 掉的狀態升等 + 首儲推薦獎勵
      const customer = await tx.customer.findUnique({
        where: { id: original.customerId },
        select: { convertedAt: true },
      });
      const isFirstPurchase = !customer?.convertedAt;

      await tx.customer.update({
        where: { id: original.customerId },
        data: {
          customerStage: "ACTIVE",
          selfBookingEnabled: true,
          ...(isFirstPurchase && { convertedAt: now }),
        },
      });

      // 首儲推薦獎勵（僅首次購課且有 sponsor 才觸發）
      // 靜默失敗；dedup key 同 PR-3：PointRecord @@unique 擋重複發獎
      await awardFirstTopupReferralPointsIfEligible({
        customerId: original.customerId,
        storeId: original.storeId,
        isFirstPurchase,
        tx,
      });
    });

    revalidateTransactions(original.customerId);
    return { success: true, data: { transactionId: original.id } };
  } catch (e) {
    return handleActionError(e);
  }
}
