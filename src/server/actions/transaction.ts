"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { checkCurrentStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { revalidateTransactions } from "@/lib/revalidation";
import type { ActionResult } from "@/types";
import { Prisma } from "@prisma/client";
import type { PaymentMethod, TransactionType, TransactionAuditAction } from "@prisma/client";
import { getTransactionDetail } from "@/server/queries/transaction";
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

const voidPendingPaymentSchema = z.object({
  reason: z.string().max(200).optional(),
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

// ============================================================
// voidPendingTransaction
//
// 作廢一筆「待確認付款」交易（測試資料、誤建單）。只允許：
//   - paymentMethod ∈ {TRANSFER, UNPAID}
//   - paymentStatus === PENDING
//   - status ∉ {CANCELLED, REFUNDED}
// 設為 status=CANCELLED, paymentStatus=CANCELLED；不會開通任何方案/堂數，
// 也會從待確認清單消失（getPendingPaymentTransactions 已過濾 CANCELLED）。
// ============================================================

export async function voidPendingTransaction(
  transactionId: string,
  input?: z.infer<typeof voidPendingPaymentSchema>
): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const user = await requirePermission("transaction.create");
    const data = input ? voidPendingPaymentSchema.parse(input) : {};

    const original = await prisma.transaction.findUnique({
      where: { id: transactionId },
      select: {
        id: true,
        storeId: true,
        customerId: true,
        paymentStatus: true,
        paymentMethod: true,
        status: true,
        note: true,
      },
    });
    if (!original) throw new AppError("NOT_FOUND", "交易紀錄不存在");
    assertStoreAccess(user, original.storeId);

    if (original.paymentMethod !== "TRANSFER" && original.paymentMethod !== "UNPAID") {
      throw new AppError(
        "BUSINESS_RULE",
        `付款方式為 ${original.paymentMethod}，不在待確認清單，無法作廢`
      );
    }
    if (original.paymentStatus !== "PENDING") {
      throw new AppError(
        "BUSINESS_RULE",
        `交易付款狀態為 ${original.paymentStatus}，無法作廢`
      );
    }
    if (original.status === "CANCELLED" || original.status === "REFUNDED") {
      throw new AppError(
        "BUSINESS_RULE",
        `交易狀態為 ${original.status}，無法作廢`
      );
    }

    const voidNote = `[作廢 ${new Date().toISOString().slice(0, 10)}${data.reason ? ` ${data.reason}` : ""}]`;
    const newNote = original.note ? `${original.note}\n${voidNote}` : voidNote;

    const result = await prisma.transaction.updateMany({
      where: {
        id: transactionId,
        paymentStatus: "PENDING",
        status: { notIn: ["CANCELLED", "REFUNDED"] },
      },
      data: {
        status: "CANCELLED",
        paymentStatus: "CANCELLED",
        note: newNote,
      },
    });

    if (result.count === 0) {
      throw new AppError("CONFLICT", "此交易狀態已變更，無法作廢");
    }

    revalidateTransactions(original.customerId);
    return { success: true, data: { transactionId: original.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// === v1 取消交易模組（safe corrections + VOID） ===
// ============================================================
//
// 設計原則：
//   1. 交易不可硬刪除；金額/顧客/方案不可改
//   2. 可改：備註（permission "transaction.create"）
//          / 付款方式 / 歸屬店長 / 取消交易（permission "transaction.void"）
//   3. 所有異動寫 TransactionAuditLog
//   4. VOIDED 後不可再編輯
//   5. voidTransaction 必須 prisma.$transaction 包裹（一致性）
//   6. PACKAGE_PURCHASE 取消時：
//        全 AVAILABLE → 連動 wallet=CANCELLED, walletSession=VOIDED
//        有 RESERVED → 拒絕
//        有 COMPLETED → 拒絕
//   7. CAS pattern：updateMany where status=SUCCESS，count=0 拋 CONFLICT 防併發
// ============================================================

const updateNoteSchema = z.object({
  transactionId: z.string().min(1),
  note: z.string().max(500),
});

const updatePaymentMethodSchema = z.object({
  transactionId: z.string().min(1),
  paymentMethod: z.enum(["CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD", "OTHER", "UNPAID"]),
  reason: z.string().min(1, "請填寫修改原因").max(200),
});

const updateOwnerStaffSchema = z.object({
  transactionId: z.string().min(1),
  staffId: z.string().min(1),
  reason: z.string().min(1, "請填寫修改原因").max(200),
});

const voidTransactionSchema = z.object({
  transactionId: z.string().min(1),
  reason: z.string().min(1, "請填寫取消原因").max(500),
});

/**
 * 取「可序列化」交易快照供 audit log JSON 欄位使用
 * 只取會變動的欄位 + 必要識別資訊；Decimal/Date 轉成 primitive
 */
function pickAuditFields(
  source: {
    status?: string | null;
    paymentMethod?: string | null;
    paymentStatus?: string | null;
    revenueStaffId?: string | null;
    note?: string | null;
    voidedAt?: Date | null;
    voidedByUserId?: string | null;
    voidReason?: string | null;
  },
  keys: ReadonlyArray<keyof typeof source>,
) {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = source[k];
    out[k as string] = v instanceof Date ? v.toISOString() : v ?? null;
  }
  return out;
}

async function writeTransactionAuditLog(
  tx: Prisma.TransactionClient,
  params: {
    storeId: string;
    transactionId: string;
    actorUserId: string;
    action: TransactionAuditAction;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    reason?: string | null;
  },
) {
  await tx.transactionAuditLog.create({
    data: {
      storeId: params.storeId,
      transactionId: params.transactionId,
      actorUserId: params.actorUserId,
      action: params.action,
      beforeJson: params.before ? (params.before as Prisma.InputJsonValue) : Prisma.DbNull,
      afterJson: params.after ? (params.after as Prisma.InputJsonValue) : Prisma.DbNull,
      reason: params.reason ?? null,
    },
  });
}

/**
 * updateTransactionNote — 修改備註
 * Permission: transaction.create（編輯權限即可）
 * VOIDED 不可改
 */
export async function updateTransactionNote(
  input: z.infer<typeof updateNoteSchema>,
): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const user = await requirePermission("transaction.create");
    const data = updateNoteSchema.parse(input);

    const original = await prisma.transaction.findUnique({
      where: { id: data.transactionId },
      select: { id: true, storeId: true, customerId: true, status: true, note: true },
    });
    if (!original) throw new AppError("NOT_FOUND", "交易紀錄不存在");
    assertStoreAccess(user, original.storeId);
    if (original.status === "VOIDED") {
      throw new AppError("BUSINESS_RULE", "已作廢的交易不可再編輯");
    }

    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: data.transactionId },
        data: { note: data.note },
      });
      await writeTransactionAuditLog(tx, {
        storeId: original.storeId,
        transactionId: original.id,
        actorUserId: user.id,
        action: "UPDATE_NOTE",
        before: { note: original.note },
        after: { note: data.note },
      });
    });

    revalidateTransactions(original.customerId);
    return { success: true, data: { transactionId: original.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

/**
 * updateTransactionPaymentMethod — 更正付款方式
 * Permission: transaction.void
 * Reason 必填；VOIDED 不可改
 */
export async function updateTransactionPaymentMethod(
  input: z.infer<typeof updatePaymentMethodSchema>,
): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const user = await requirePermission("transaction.void");
    const data = updatePaymentMethodSchema.parse(input);

    const original = await prisma.transaction.findUnique({
      where: { id: data.transactionId },
      select: {
        id: true,
        storeId: true,
        customerId: true,
        status: true,
        paymentMethod: true,
      },
    });
    if (!original) throw new AppError("NOT_FOUND", "交易紀錄不存在");
    assertStoreAccess(user, original.storeId);
    if (original.status === "VOIDED") {
      throw new AppError("BUSINESS_RULE", "已作廢的交易不可再編輯");
    }
    if (original.paymentMethod === data.paymentMethod) {
      throw new AppError("VALIDATION", "付款方式未變更");
    }

    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: data.transactionId },
        data: { paymentMethod: data.paymentMethod as PaymentMethod },
      });
      await writeTransactionAuditLog(tx, {
        storeId: original.storeId,
        transactionId: original.id,
        actorUserId: user.id,
        action: "UPDATE_PAYMENT_METHOD",
        before: { paymentMethod: original.paymentMethod },
        after: { paymentMethod: data.paymentMethod },
        reason: data.reason,
      });
    });

    revalidateTransactions(original.customerId);
    return { success: true, data: { transactionId: original.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

/**
 * updateTransactionOwnerStaff — 更正歸屬店長（revenueStaffId）
 * Permission: transaction.void
 * Reason 必填；目標 staff 必須同店；VOIDED 不可改
 */
export async function updateTransactionOwnerStaff(
  input: z.infer<typeof updateOwnerStaffSchema>,
): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const user = await requirePermission("transaction.void");
    const data = updateOwnerStaffSchema.parse(input);

    const original = await prisma.transaction.findUnique({
      where: { id: data.transactionId },
      select: {
        id: true,
        storeId: true,
        customerId: true,
        status: true,
        revenueStaffId: true,
      },
    });
    if (!original) throw new AppError("NOT_FOUND", "交易紀錄不存在");
    assertStoreAccess(user, original.storeId);
    if (original.status === "VOIDED") {
      throw new AppError("BUSINESS_RULE", "已作廢的交易不可再編輯");
    }
    if (original.revenueStaffId === data.staffId) {
      throw new AppError("VALIDATION", "歸屬店長未變更");
    }

    const staff = await prisma.staff.findUnique({
      where: { id: data.staffId },
      select: { id: true, storeId: true, displayName: true },
    });
    if (!staff) throw new AppError("NOT_FOUND", "目標店長不存在");
    if (staff.storeId !== original.storeId) {
      throw new AppError("BUSINESS_RULE", "店長不屬於此交易所在店舖");
    }

    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: data.transactionId },
        data: {
          revenueStaffId: data.staffId,
          coachNameSnapshot: staff.displayName,
        },
      });
      await writeTransactionAuditLog(tx, {
        storeId: original.storeId,
        transactionId: original.id,
        actorUserId: user.id,
        action: "UPDATE_OWNER_STAFF",
        before: { revenueStaffId: original.revenueStaffId },
        after: { revenueStaffId: data.staffId },
        reason: data.reason,
      });
    });

    revalidateTransactions(original.customerId);
    return { success: true, data: { transactionId: original.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

/**
 * voidTransaction — v1 取消交易
 *
 * Permission: transaction.void
 *
 * 行為：
 *   - SINGLE_PURCHASE / TRIAL_PURCHASE：直接 VOID
 *   - PACKAGE_PURCHASE：
 *       * 全 AVAILABLE → wallet=CANCELLED, walletSessions=VOIDED, transaction=VOIDED
 *       * 有 RESERVED → 拒絕（請先取消預約）
 *       * 有 COMPLETED → 拒絕（需走退款流程）
 *   - 其他 type：v1 範圍外，拒絕
 *
 * 並發保護：updateMany WHERE status=SUCCESS，count===1 才繼續，避免同時兩人 void
 *
 * 一致性：整段在 prisma.$transaction 裡
 */
export async function voidTransaction(
  input: z.infer<typeof voidTransactionSchema>,
): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const user = await requirePermission("transaction.void");
    const data = voidTransactionSchema.parse(input);

    const original = await prisma.transaction.findUnique({
      where: { id: data.transactionId },
      select: {
        id: true,
        storeId: true,
        customerId: true,
        status: true,
        transactionType: true,
        customerPlanWalletId: true,
        amount: true,
        note: true,
      },
    });
    if (!original) throw new AppError("NOT_FOUND", "交易紀錄不存在");
    assertStoreAccess(user, original.storeId);

    if (original.status !== "SUCCESS") {
      throw new AppError("BUSINESS_RULE", `交易狀態為 ${original.status}，無法取消`);
    }

    // v1 範圍外的交易型別
    const ALLOWED_TYPES: TransactionType[] = [
      "TRIAL_PURCHASE",
      "SINGLE_PURCHASE",
      "PACKAGE_PURCHASE",
    ];
    if (!ALLOWED_TYPES.includes(original.transactionType)) {
      throw new AppError(
        "BUSINESS_RULE",
        `${original.transactionType} 不支援取消交易（v1 範圍：購買類交易）`,
      );
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // ── PACKAGE_PURCHASE：先檢查 walletSession 狀態 ──
      if (original.transactionType === "PACKAGE_PURCHASE") {
        if (!original.customerPlanWalletId) {
          throw new AppError("BUSINESS_RULE", "套餐購買缺少錢包關聯，無法取消");
        }
        const sessions = await tx.walletSession.findMany({
          where: { walletId: original.customerPlanWalletId },
          select: { id: true, status: true },
        });
        const completedCount = sessions.filter((s) => s.status === "COMPLETED").length;
        const reservedCount = sessions.filter((s) => s.status === "RESERVED").length;

        if (completedCount > 0) {
          throw new AppError(
            "BUSINESS_RULE",
            "此方案已有完成堂數，不能直接取消交易。如需退款，請使用退款流程。",
          );
        }
        if (reservedCount > 0) {
          throw new AppError(
            "BUSINESS_RULE",
            "此方案已有預約佔用堂數，請先取消相關預約後，再取消交易。",
          );
        }

        // 全部 AVAILABLE → 連動作廢
        await tx.walletSession.updateMany({
          where: {
            walletId: original.customerPlanWalletId,
            status: "AVAILABLE",
          },
          data: {
            status: "VOIDED",
            voidedAt: now,
            voidReason: `交易取消：${data.reason}`,
          },
        });
        await tx.customerPlanWallet.update({
          where: { id: original.customerPlanWalletId },
          data: {
            status: "CANCELLED",
            remainingSessions: 0,
          },
        });
      }

      // ── CAS：交易標記 VOIDED ──
      const result = await tx.transaction.updateMany({
        where: { id: original.id, status: "SUCCESS" },
        data: {
          status: "VOIDED",
          voidedAt: now,
          voidedByUserId: user.id,
          voidReason: data.reason,
        },
      });
      if (result.count === 0) {
        throw new AppError("CONFLICT", "此交易狀態已變更，無法取消");
      }

      await writeTransactionAuditLog(tx, {
        storeId: original.storeId,
        transactionId: original.id,
        actorUserId: user.id,
        action: "VOID",
        before: pickAuditFields(
          { status: original.status, voidedAt: null, voidedByUserId: null, voidReason: null },
          ["status", "voidedAt", "voidedByUserId", "voidReason"],
        ),
        after: pickAuditFields(
          { status: "VOIDED", voidedAt: now, voidedByUserId: user.id, voidReason: data.reason },
          ["status", "voidedAt", "voidedByUserId", "voidReason"],
        ),
        reason: data.reason,
      });
    });

    revalidateTransactions(original.customerId);
    return { success: true, data: { transactionId: original.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// fetchTransactionDetailDTO — server action wrapper for client Drawer
// 將 Prisma 物件轉成 plain DTO（Decimal/Date → primitive）方便 client 使用
// ============================================================

export async function fetchTransactionDetailDTO(
  transactionId: string,
): Promise<ActionResult<TransactionDetailDTO>> {
  try {
    const tx = await getTransactionDetail(transactionId);

    const sessions = tx.customerPlanWallet?.sessions ?? [];
    const breakdown = {
      available: sessions.filter((s) => s.status === "AVAILABLE").length,
      reserved: sessions.filter((s) => s.status === "RESERVED").length,
      completed: sessions.filter((s) => s.status === "COMPLETED").length,
      voided: sessions.filter((s) => s.status === "VOIDED").length,
    };

    const data: TransactionDetailDTO = {
      id: tx.id,
      customerId: tx.customerId,
      customerName: tx.customer.name,
      storeId: tx.storeId,
      status: tx.status,
      transactionType: tx.transactionType,
      paymentMethod: tx.paymentMethod,
      paymentStatus: tx.paymentStatus,
      amount: Number(tx.amount),
      originalAmount: tx.originalAmount ? Number(tx.originalAmount) : null,
      note: tx.note,
      revenueStaffId: tx.revenueStaffId,
      revenueStaffName: tx.revenueStaff.displayName,
      serviceStaffName: tx.serviceStaff?.displayName ?? null,
      createdAt: tx.createdAt.toISOString(),
      voidedAt: tx.voidedAt?.toISOString() ?? null,
      voidedByName: tx.voidedBy?.name ?? null,
      voidReason: tx.voidReason,
      customerPlanWallet: tx.customerPlanWallet
        ? {
            id: tx.customerPlanWallet.id,
            planName: tx.customerPlanWallet.plan.name,
            totalSessions: tx.customerPlanWallet.totalSessions,
            remainingSessions: tx.customerPlanWallet.remainingSessions,
            walletStatus: tx.customerPlanWallet.status,
            sessionsBreakdown: breakdown,
          }
        : null,
      booking: tx.booking
        ? {
            id: tx.booking.id,
            bookingDate: tx.booking.bookingDate.toISOString(),
            slotTime: tx.booking.slotTime,
            bookingStatus: tx.booking.bookingStatus,
          }
        : null,
      auditLogs: tx.auditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        actorName: log.actor.name,
        reason: log.reason,
        beforeJson: log.beforeJson as unknown,
        afterJson: log.afterJson as unknown,
        createdAt: log.createdAt.toISOString(),
      })),
    };

    return { success: true, data };
  } catch (e) {
    return handleActionError(e);
  }
}

export type TransactionDetailDTO = {
  id: string;
  customerId: string;
  customerName: string;
  storeId: string;
  status: string;
  transactionType: string;
  paymentMethod: string;
  paymentStatus: string;
  amount: number;
  originalAmount: number | null;
  note: string | null;
  revenueStaffId: string;
  revenueStaffName: string;
  serviceStaffName: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
  customerPlanWallet: {
    id: string;
    planName: string;
    totalSessions: number;
    remainingSessions: number;
    walletStatus: string;
    sessionsBreakdown: { available: number; reserved: number; completed: number; voided: number };
  } | null;
  booking: {
    id: string;
    bookingDate: string;
    slotTime: string;
    bookingStatus: string;
  } | null;
  auditLogs: Array<{
    id: string;
    action: string;
    actorName: string;
    reason: string | null;
    beforeJson: unknown;
    afterJson: unknown;
    createdAt: string;
  }>;
};
