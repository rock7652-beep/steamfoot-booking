"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { requireFeature } from "@/lib/shop-config";
import { FEATURES } from "@/lib/shop-plan";
import { revalidateTransactions } from "@/lib/revalidation";
import type { ActionResult } from "@/types";
import type { PaymentMethod, TransactionType } from "@prisma/client";

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
    await requireFeature(FEATURES.TRANSACTION_MANAGEMENT);
    const data = createTransactionSchema.parse(input);

    // 確認顧客存在
    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, assignedStaffId: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

    // 若指定 wallet，確認其存在且屬於該顧客
    if (data.customerPlanWalletId) {
      const wallet = await prisma.customerPlanWallet.findFirst({
        where: { id: data.customerPlanWalletId, customerId: data.customerId },
      });
      if (!wallet) throw new AppError("NOT_FOUND", "課程錢包不存在或不屬於該顧客");
    }

    const tx = await prisma.transaction.create({
      data: {
        customerId: data.customerId,
        bookingId: data.bookingId ?? null,
        revenueStaffId: customer.assignedStaffId ?? user.staffId ?? (() => { throw new AppError("FORBIDDEN", "顧客尚未指派店長，無法建立交易"); })(),
        serviceStaffId: user.staffId ?? null,
        customerPlanWalletId: data.customerPlanWalletId ?? null,
        transactionType: data.transactionType as TransactionType,
        paymentMethod: data.paymentMethod as PaymentMethod,
        amount: data.amount,
        quantity: data.quantity ?? null,
        note: data.note ?? null,
      },
    });

    revalidateTransactions(data.customerId);
    return { success: true, data: { transactionId: tx.id } };
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
    await requirePermission("transaction.create");
    const data = refundTransactionSchema.parse(input);

    const original = await prisma.transaction.findUnique({
      where: { id: originalTransactionId },
      include: { customer: { select: { assignedStaffId: true } } },
    });
    if (!original) throw new AppError("NOT_FOUND", "原始交易不存在");

    if (original.transactionType === "REFUND") {
      throw new AppError("BUSINESS_RULE", "不能對退款交易再次退款");
    }
    if (original.transactionType === "SESSION_DEDUCTION") {
      throw new AppError("BUSINESS_RULE", "扣堂紀錄不適用退款，請改用堂數調整");
    }

    const refund = await prisma.transaction.create({
      data: {
        customerId: original.customerId,
        bookingId: original.bookingId ?? null,
        revenueStaffId: original.revenueStaffId, // 維持原始快照
        customerPlanWalletId: original.customerPlanWalletId ?? null,
        transactionType: "REFUND",
        paymentMethod: data.paymentMethod as PaymentMethod,
        amount: -data.amount, // 負數
        note: data.note ? `[退款] ${data.note}` : `[退款] 原交易 ${originalTransactionId}`,
      },
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
      select: { id: true, assignedStaffId: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

    const tx = await prisma.transaction.create({
      data: {
        customerId: data.customerId,
        revenueStaffId: customer.assignedStaffId ?? user.staffId ?? (() => { throw new AppError("FORBIDDEN", "顧客尚未指派店長，無法建立交易"); })(),
        serviceStaffId: user.staffId ?? null,
        transactionType: data.amount >= 0 ? "SUPPLEMENT" : "ADJUSTMENT",
        paymentMethod: "CASH",
        amount: data.amount,
        note: data.note,
      },
    });

    revalidateTransactions(data.customerId);
    return { success: true, data: { transactionId: tx.id } };
  } catch (e) {
    return handleActionError(e);
  }
}
