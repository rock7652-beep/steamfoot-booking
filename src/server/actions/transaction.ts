"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requirePermission,
  requireWritablePermission,
} from "@/lib/permissions";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
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
import {
  assertCustomerInOperationStore,
  assertSameStore,
} from "@/lib/store-consistency";
import { buildTransactionSnapshot, buildRefundSnapshot } from "@/lib/transaction-snapshot";
import { awardFirstTopupReferralPointsIfEligible } from "@/server/services/referral-points";
import { computeRefundPlan, type RefundMode } from "@/lib/refund-plan";
import { allocateSessionsFefo, seedWalletSessions } from "@/server/services/wallet-session";
import { parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";

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

const refundTransactionLegacySchema = z.object({
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
    const storeId = currentStoreId(user);

    // 確認顧客存在
    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, assignedStaffId: true, storeId: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
    assertStoreAccess(user, customer.storeId);
    assertCustomerInOperationStore(customer, storeId);
    // 訂閱到期保護：到期店家不可建立交易 / 收款（無訂閱店不擋）
    await assertStoreSubscriptionWritable(customer.storeId);

    // 若指定 wallet，確認其存在且屬於該顧客
    if (data.customerPlanWalletId) {
      const wallet = await prisma.customerPlanWallet.findFirst({
        where: { id: data.customerPlanWalletId, customerId: data.customerId },
      });
      if (!wallet) throw new AppError("NOT_FOUND", "課程錢包不存在或不屬於該顧客");
      assertSameStore("CustomerPlanWallet", wallet.storeId, storeId);
    }

    if (data.bookingId) {
      const booking = await prisma.booking.findFirst({
        where: { id: data.bookingId, customerId: data.customerId },
        select: { id: true, storeId: true },
      });
      if (!booking) throw new AppError("NOT_FOUND", "預約不存在或不屬於該顧客");
      assertSameStore("Booking", booking.storeId, storeId);
    }

    const revenueStaffId = customer.assignedStaffId ?? user.staffId ?? (() => { throw new AppError("FORBIDDEN", "顧客尚未指派店長，無法建立交易"); })();
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
// refundTransactionLegacy — 既有「不連動 wallet」退款流程（保留供既有資料 / 工具使用）
//
// 針對一筆既有交易建立對應的 REFUND 紀錄（負數 amount）
// 不自動修改 wallet；退款後若需調整堂數，用 adjustRemainingSessions
//
// ⚠️ 新顧客流程請改用 v2 refundTransaction（檔案下方），它會：
//   - 連動 wallet status / WalletSession status
//   - 建立 inverse REFUND tx，refundOfTransactionId 反向關聯
//   - 原交易保留 SUCCESS（不改 REFUNDED）
//   - 寫 TransactionAuditLog (action=REFUND)
// ============================================================

export async function refundTransactionLegacy(
  originalTransactionId: string,
  input: z.infer<typeof refundTransactionLegacySchema>
): Promise<ActionResult<{ refundId: string }>> {
  try {
    const user = await requireWritablePermission("transaction.create");
    const data = refundTransactionLegacySchema.parse(input);

    const original = await prisma.transaction.findUnique({
      where: { id: originalTransactionId },
      include: { customer: { select: { assignedStaffId: true } } },
    });
    if (!original) throw new AppError("NOT_FOUND", "原始交易不存在");
    assertStoreAccess(user, original.storeId);
    // 訂閱到期保護：到期店家不可退款（平台只保留資料，退款屬店家營運責任）
    await assertStoreSubscriptionWritable(original.storeId);

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
          storeId: original.storeId,
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
    const storeId = currentStoreId(user);

    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, assignedStaffId: true, storeId: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
    assertStoreAccess(user, customer.storeId);
    assertCustomerInOperationStore(customer, storeId);
    // 訂閱到期保護：到期店家不可建立財務調整（無訂閱店不擋）
    await assertStoreSubscriptionWritable(customer.storeId);

    const revenueStaffId = customer.assignedStaffId ?? user.staffId ?? (() => { throw new AppError("FORBIDDEN", "顧客尚未指派店長，無法建立交易"); })();
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
        customerPlanWalletId: true,
        planId: true,
        amount: true,
        planSessionCountSnapshot: true,
        pendingWalletExpiryDateSnapshot: true,
        bookingId: true,
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

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${original.customerId} FOR UPDATE`;
      const now = new Date();

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

      // 新式 PENDING transaction 在 CAS 成功後才開通。歷史 PENDING 已有
      // wallet 時絕不重建 ledger，僅完成付款確認與既有後續權益流程。
      if (!original.customerPlanWalletId) {
        if (!original.planId || original.planSessionCountSnapshot == null) {
          throw new AppError("BUSINESS_RULE", "此待付款交易缺少方案開通快照，請人工核帳處理");
        }
        const today = toLocalDateStr();
        // startDate 是實際入帳日；expiryDate 是購買申請時已解析完成的快照。
        // 不可重讀或重算可能已變更的 ServicePlan。
        const expiryDate = original.pendingWalletExpiryDateSnapshot;
        const wallet = await tx.customerPlanWallet.create({
          data: {
            customerId: original.customerId,
            storeId: original.storeId,
            planId: original.planId,
            purchasedPrice: original.amount,
            totalSessions: original.planSessionCountSnapshot,
            remainingSessions: original.planSessionCountSnapshot,
            startDate: parseTaiwanDateToDbDate(today),
            expiryDate,
            status: "ACTIVE",
          },
        });
        await seedWalletSessions(tx, wallet.id, original.planSessionCountSnapshot);
        await tx.transaction.update({
          where: { id: transactionId },
          data: { customerPlanWalletId: wallet.id },
        });

        // 單次預約現場轉購：轉帳確認入帳後，才把同一筆預約改成新方案扣堂。
        // 所有寫入都在本交易內；狀態不符時連付款確認與 wallet 建立一併回滾。
        if (original.bookingId) {
          await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${original.bookingId} FOR UPDATE`;
          const booking = await tx.booking.findUnique({
            where: { id: original.bookingId },
            select: { id: true, customerId: true, storeId: true, bookingType: true, bookingStatus: true, isMakeup: true, people: true },
          });
          if (
            !booking ||
            booking.customerId !== original.customerId ||
            booking.storeId !== original.storeId ||
            booking.bookingType !== "SINGLE" ||
            booking.isMakeup ||
            (booking.bookingStatus !== "PENDING" && booking.bookingStatus !== "CONFIRMED")
          ) {
            throw new AppError("BUSINESS_RULE", "關聯預約狀態已變更，請先人工核對後再確認付款");
          }
          if (original.planSessionCountSnapshot < booking.people) {
            throw new AppError("BUSINESS_RULE", "新方案堂數不足本次預約人數，請人工核對");
          }
          await allocateSessionsFefo(tx, {
            candidates: [{
              id: wallet.id,
              expiryDate,
              createdAt: now,
              remainingSessions: original.planSessionCountSnapshot,
            }],
            bookingId: booking.id,
            count: booking.people,
            preferredWalletId: wallet.id,
          });
          await tx.booking.update({
            where: { id: booking.id },
            data: {
              bookingType: "PACKAGE_SESSION",
              customerPlanWalletId: wallet.id,
              servicePlanId: original.planId,
            },
          });
        }
      }

      // CAS 成功 → 重現 PENDING 時 skip 的狀態升等 + 首儲推薦獎勵
      const customer = await tx.customer.findUnique({
        where: { id: original.customerId },
        select: {
          convertedAt: true,
          customerStage: true,
          selfBookingEnabled: true,
        },
      });
      if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
      const isFirstPurchase = !customer.convertedAt;

      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          conversionEffectsApplied: true,
          firstTopupRewardsApplied: isFirstPurchase,
          preConversionCustomerStage: customer.customerStage,
          preConversionSelfBookingEnabled: customer.selfBookingEnabled,
          preConversionConvertedAt: customer.convertedAt,
        },
      });

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
        customerPlanWalletId: true,
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

    const voidNote = `[作廢 ${toLocalDateStr()}${data.reason ? ` ${data.reason}` : ""}]`;
    const newNote = original.note ? `${original.note}\n${voidNote}` : voidNote;

    await prisma.$transaction(async (tx) => {
      if (original.customerPlanWalletId) {
        const [wallet, sessionGroups, relatedTransactions] = await Promise.all([
          tx.customerPlanWallet.findUnique({
            where: { id: original.customerPlanWalletId },
            select: { id: true, totalSessions: true, status: true },
          }),
          tx.walletSession.groupBy({
            by: ["status"],
            where: { walletId: original.customerPlanWalletId },
            _count: { _all: true },
          }),
          tx.transaction.count({
            where: { customerPlanWalletId: original.customerPlanWalletId, id: { not: transactionId } },
          }),
        ]);
        if (!wallet) throw new AppError("BUSINESS_RULE", "既有方案錢包不存在，請人工核帳處理");
        const available = sessionGroups.find((row) => row.status === "AVAILABLE")?._count._all ?? 0;
        const usedOrAdjusted = sessionGroups.some((row) => row.status !== "AVAILABLE") ||
          available !== wallet.totalSessions || relatedTransactions > 0 || wallet.status !== "ACTIVE";
        if (usedOrAdjusted) {
          throw new AppError("BUSINESS_RULE", "此待付款交易的既有方案已有預約、扣堂或人工調整，請人工核帳處理，系統不會自動作廢");
        }
        const voided = await tx.walletSession.updateMany({
          where: { walletId: wallet.id, status: "AVAILABLE" },
          data: { status: "VOIDED", voidedAt: new Date(), voidReason: "待付款交易作廢" },
        });
        if (voided.count !== wallet.totalSessions) {
          throw new AppError("CONFLICT", "方案堂數狀態已變更，請重新確認後人工核帳");
        }
        await tx.customerPlanWallet.update({
          where: { id: wallet.id },
          data: { status: "CANCELLED", remainingSessions: 0 },
        });
      }

      const result = await tx.transaction.updateMany({
        where: { id: transactionId, paymentStatus: "PENDING", status: { notIn: ["CANCELLED", "REFUNDED"] } },
        data: { status: "CANCELLED", paymentStatus: "CANCELLED", note: newNote },
      });
      if (result.count === 0) throw new AppError("CONFLICT", "此交易狀態已變更，無法作廢");
    });

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
    const user = await requireWritablePermission("transaction.void");
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
    const user = await requireWritablePermission("transaction.void");
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
 *   - 沒有 wallet 的 SINGLE_PURCHASE / TRIAL_PURCHASE：直接 VOID
 *   - 任一購買交易只要綁有 wallet：
 *       * 全 AVAILABLE 且未綁 booking → wallet=CANCELLED, walletSessions=VOIDED
 *       * 有 RESERVED / COMPLETED / BACKFILLED / VOIDED → 拒絕，避免部分作廢
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
    const user = await requireWritablePermission("transaction.void");
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
        paymentStatus: true,
        paymentMethod: true,
        amount: true,
        note: true,
        createdAt: true,
        paidAt: true,
        conversionEffectsApplied: true,
        firstTopupRewardsApplied: true,
        preConversionCustomerStage: true,
        preConversionSelfBookingEnabled: true,
        preConversionConvertedAt: true,
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
      // 同一顧客的取消流程必須序列化，避免兩筆購買同時取消後遺漏狀態還原。
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${original.customerId} FOR UPDATE`;

      const lockedOriginal = await tx.transaction.findUnique({
        where: { id: original.id },
        select: {
          id: true,
          storeId: true,
          customerId: true,
          status: true,
          transactionType: true,
          customerPlanWalletId: true,
          paymentStatus: true,
          paymentMethod: true,
          amount: true,
          note: true,
          createdAt: true,
          paidAt: true,
          conversionEffectsApplied: true,
          firstTopupRewardsApplied: true,
          preConversionCustomerStage: true,
          preConversionSelfBookingEnabled: true,
          preConversionConvertedAt: true,
        },
      });
      if (!lockedOriginal) throw new AppError("NOT_FOUND", "交易紀錄不存在");
      const current = lockedOriginal;

      if (current.transactionType === "PACKAGE_PURCHASE" && !current.customerPlanWalletId) {
        throw new AppError("BUSINESS_RULE", "套餐購買缺少錢包關聯，無法取消");
      }
      // 只要交易實際綁有 wallet，就必須以 wallet 為單位完整作廢。
      // 單次贈送方案同樣會建立 1 堂 wallet；過去只處理 PACKAGE_PURCHASE，
      // 會留下可使用的幽靈堂數。
      if (current.customerPlanWalletId) {
        // 誤建單不應因已標記付款而被迫走退款流程。
        // 是否可安全取消，以方案堂數完全未使用、未預約為準；下方 wallet/session
        // 真值檢查與同一 DB transaction 會確保營收與堂數一起回復。
        const wallet = await tx.customerPlanWallet.findFirst({
          where: {
            id: current.customerPlanWalletId,
            customerId: current.customerId,
            storeId: current.storeId,
            status: "ACTIVE",
          },
          select: { id: true, totalSessions: true, remainingSessions: true },
        });
        if (!wallet) {
          throw new AppError("CONFLICT", "課程錢包狀態或所屬顧客已變更，無法取消交易");
        }
        const otherWalletPurchases = await tx.transaction.count({
          where: {
            id: { not: current.id },
            customerPlanWalletId: wallet.id,
            transactionType: { in: ALLOWED_TYPES },
          },
        });
        if (otherWalletPurchases > 0) {
          throw new AppError("BUSINESS_RULE", "此交易不是方案錢包的唯一來源，無法直接取消");
        }
        if (wallet.remainingSessions !== wallet.totalSessions) {
          throw new AppError("BUSINESS_RULE", "此方案已有堂數異動，不能直接取消交易");
        }
        const sessions = await tx.walletSession.findMany({
          where: { walletId: wallet.id },
          select: { id: true, status: true, bookingId: true },
        });
        if (sessions.length !== wallet.totalSessions) {
          throw new AppError(
            "CONFLICT",
            "課程錢包堂數明細不完整，無法安全取消交易",
          );
        }
        if (sessions.some((session) => session.status !== "AVAILABLE" || session.bookingId != null)) {
          throw new AppError(
            "BUSINESS_RULE",
            "此方案已有預約或堂數異動，不能直接取消交易。",
          );
        }

        const voidSessions = await tx.walletSession.updateMany({
          where: {
            walletId: wallet.id,
            status: "AVAILABLE",
            bookingId: null,
          },
          data: {
            status: "VOIDED",
            voidedAt: now,
            voidReason: `交易取消：${data.reason}`,
            voidedByStaffId: user.staffId ?? null,
          },
        });
        if (voidSessions.count !== wallet.totalSessions) {
          throw new AppError("CONFLICT", "課程堂數狀態已變更，請重新整理後再試一次");
        }
        const cancelWallet = await tx.customerPlanWallet.updateMany({
          where: {
            id: wallet.id,
            customerId: current.customerId,
            storeId: current.storeId,
            status: "ACTIVE",
            remainingSessions: wallet.totalSessions,
          },
          data: {
            status: "CANCELLED",
            remainingSessions: 0,
          },
        });
        if (cancelWallet.count !== 1) {
          throw new AppError("CONFLICT", "課程錢包狀態已變更，請重新整理後再試一次");
        }
      }

      // ── CAS：交易標記 VOIDED ──
      const result = await tx.transaction.updateMany({
        where: { id: current.id, status: "SUCCESS", paymentStatus: current.paymentStatus },
        data: {
          status: "VOIDED",
          ...(current.paymentStatus === "PENDING" && { paymentStatus: "CANCELLED" }),
          voidedAt: now,
          voidedByUserId: user.id,
          voidReason: data.reason,
        },
      });
      if (result.count === 0) {
        throw new AppError("CONFLICT", "此交易狀態已變更，無法取消");
      }

      // 只還原由正式方案開通流程留下的狀態快照；人工補帳不會誤改顧客資料。
      if (current.conversionEffectsApplied) {
        if (!current.paidAt) {
          throw new AppError("CONFLICT", "交易缺少實際付款時間，請人工核帳處理");
        }
        const activationTime = current.paidAt;
        const [previousEffectfulPurchase, nextEffectfulPurchase] = await Promise.all([
          tx.transaction.findFirst({
            where: {
              customerId: current.customerId,
              storeId: current.storeId,
              status: "SUCCESS",
              transactionType: { in: ALLOWED_TYPES },
              paymentStatus: { in: ["SUCCESS", "CONFIRMED"] },
              conversionEffectsApplied: true,
              OR: [
                { paidAt: { lt: activationTime } },
                { paidAt: activationTime, id: { lt: current.id } },
              ],
            },
            orderBy: [{ paidAt: "desc" }, { id: "desc" }],
            select: { id: true },
          }),
          tx.transaction.findFirst({
            where: {
              customerId: current.customerId,
              storeId: current.storeId,
              status: "SUCCESS",
              transactionType: { in: ALLOWED_TYPES },
              paymentStatus: { in: ["SUCCESS", "CONFIRMED"] },
              conversionEffectsApplied: true,
              OR: [
                { paidAt: { gt: activationTime } },
                { paidAt: activationTime, id: { gt: current.id } },
              ],
            },
            orderBy: [{ paidAt: "asc" }, { id: "asc" }],
            select: { id: true },
          }),
        ]);

        if (nextEffectfulPurchase && !previousEffectfulPurchase) {
          // 只有取消購買鏈最前端時才向後傳遞根快照；絕不覆寫較早交易。
          await tx.transaction.update({
            where: { id: nextEffectfulPurchase.id },
            data: {
              preConversionCustomerStage: current.preConversionCustomerStage,
              preConversionSelfBookingEnabled: current.preConversionSelfBookingEnabled,
              preConversionConvertedAt: current.preConversionConvertedAt,
              firstTopupRewardsApplied: current.firstTopupRewardsApplied,
            },
          });
        } else if (!previousEffectfulPurchase && !nextEffectfulPurchase) {
          // 只刪除這條購買鏈確定發放的首儲獎勵，避免碰到 migration 前的歷史點數。
          if (current.firstTopupRewardsApplied) {
            const referralPointRecords = await tx.pointRecord.findMany({
              where: {
                storeId: current.storeId,
                sourceKey: current.customerId,
                sourceType: { in: ["first_topup_referrer", "first_topup_self"] },
              },
              select: { id: true, customerId: true, points: true },
            });

            for (const pointRecord of referralPointRecords) {
              await tx.customer.updateMany({
                where: { id: pointRecord.customerId, storeId: current.storeId },
                data: { totalPoints: { decrement: pointRecord.points } },
              });
            }
            if (referralPointRecords.length > 0) {
              await tx.pointRecord.deleteMany({
                where: { id: { in: referralPointRecords.map((record) => record.id) } },
              });
            }
          }

          await tx.customer.updateMany({
            where: { id: current.customerId, storeId: current.storeId },
            data: {
              customerStage: current.preConversionCustomerStage ?? undefined,
              selfBookingEnabled: current.preConversionSelfBookingEnabled ?? undefined,
              convertedAt: current.preConversionConvertedAt,
            },
          });
        }
      }

      await writeTransactionAuditLog(tx, {
        storeId: current.storeId,
        transactionId: current.id,
        actorUserId: user.id,
        action: "VOID",
        before: pickAuditFields(
          { status: current.status, voidedAt: null, voidedByUserId: null, voidReason: null },
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
      // BACKFILLED 視同 COMPLETED：drawer 退款/作廢計算需要把補登已使用算入消耗
      completed: sessions.filter(
        (s) => s.status === "COMPLETED" || s.status === "BACKFILLED",
      ).length,
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
      paymentSplits: tx.paymentSplits.map((split) => ({ paymentMethod: split.paymentMethod, amount: Number(split.amount) })),
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
  paymentSplits: Array<{ paymentMethod: string; amount: number }>;
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

// ============================================================
// === v2 退款（refundTransaction） ===
// ============================================================
//
// 規格原則：退款不修改原交易；新增一筆負向 REFUND tx，靠 inverse 反查。
//
// 行為：
//   - 原交易必須 status=SUCCESS, transactionType=PACKAGE_PURCHASE
//   - 任何模式下有 RESERVED → 拒絕「請先取消預約」
//   - FULL_UNUSED 模式 + completed > 0 → 拒絕「不能全額退款」
//   - availableCount = 0 → 拒絕「沒可退款堂數」（CAS 等價：擋重複退款）
//   - 通過後：建立 REFUND tx (negative amount) + WalletSession 標 VOIDED
//     + Wallet 若無剩餘 AVAILABLE → CANCELLED + 寫 audit log REFUND
//
// 並發保護：CAS pattern — wallet.update WHERE status=ACTIVE，count=0 拋 CONFLICT
// 一致性：整段在 prisma.$transaction 內
//
// Permission: transaction.refund
// ============================================================

const refundTransactionSchema = z.object({
  transactionId: z.string().min(1),
  reason: z.string().min(1, "請填寫退款原因").max(500),
  refundMode: z.enum(["FULL_UNUSED", "REMAINING_SESSIONS"]),
});

export async function refundTransaction(
  input: z.infer<typeof refundTransactionSchema>,
): Promise<ActionResult<{ refundTransactionId: string; refundAmount: number }>> {
  try {
    const user = await requireWritablePermission("transaction.refund");
    const data = refundTransactionSchema.parse(input);

    // Pre-load 原交易 + wallet + sessions（read-only，後面在 tx 內 re-validate）
    const original = await prisma.transaction.findUnique({
      where: { id: data.transactionId },
      include: {
        customerPlanWallet: {
          include: {
            sessions: { select: { id: true, status: true } },
          },
        },
      },
    });
    if (!original) throw new AppError("NOT_FOUND", "原始交易不存在");
    assertStoreAccess(user, original.storeId);

    // Guard 1：必須 SUCCESS（不能對 VOIDED / REFUNDED / CANCELLED 退款；防重複退款）
    if (original.status !== "SUCCESS") {
      throw new AppError("BUSINESS_RULE", `交易狀態為 ${original.status}，不能退款`);
    }

    // Guard 2：v2 範圍只支援 PACKAGE_PURCHASE
    if (original.transactionType !== "PACKAGE_PURCHASE") {
      throw new AppError(
        "BUSINESS_RULE",
        `${original.transactionType} 不支援 v2 退款流程（僅限 PACKAGE_PURCHASE）`,
      );
    }

    // Guard 3：套餐必有 wallet
    const wallet = original.customerPlanWallet;
    if (!wallet || !original.customerPlanWalletId) {
      throw new AppError("BUSINESS_RULE", "套餐交易缺少錢包關聯，無法退款");
    }

    // 算退款計畫（pure helper）
    const plan = computeRefundPlan({
      originalAmount: Number(original.amount),
      totalSessions: wallet.totalSessions,
      mode: data.refundMode as RefundMode,
      sessions: wallet.sessions,
    });
    if (!plan.ok) {
      throw new AppError(plan.errorCode, plan.message);
    }

    const now = new Date();
    const refundSnapshot = buildRefundSnapshot(original);

    const refundTx = await prisma.$transaction(async (tx) => {
      // ── 1. CAS：將指定 AVAILABLE sessions 標為 VOIDED ──
      const voidResult = await tx.walletSession.updateMany({
        where: {
          id: { in: plan.sessionIdsToVoid },
          status: "AVAILABLE", // 防併發：他人剛把 session 變成 RESERVED 就會更新失敗
        },
        data: {
          status: "VOIDED",
          voidedAt: now,
          voidReason: `退款：${data.reason}`,
        },
      });
      if (voidResult.count !== plan.sessionIdsToVoid.length) {
        throw new AppError(
          "CONFLICT",
          "方案堂數狀態已變更，請重新整理後再退款",
        );
      }

      // ── 2. Wallet 連動 ──
      // 重算剩餘可用堂數（用 DB 真值，不 trust pre-load）
      const remainingAvailable = await tx.walletSession.count({
        where: { walletId: wallet.id, status: "AVAILABLE" },
      });
      const newWalletStatus = remainingAvailable === 0 ? "CANCELLED" : "ACTIVE";
      await tx.customerPlanWallet.update({
        where: { id: wallet.id },
        data: {
          status: newWalletStatus,
          remainingSessions: remainingAvailable,
        },
      });

      // ── 3. 建立 inverse REFUND tx（amount 負數，狀態 SUCCESS） ──
      const created = await tx.transaction.create({
        data: {
          customerId: original.customerId,
          storeId: original.storeId,
          revenueStaffId: original.revenueStaffId, // 維持原始歸屬
          serviceStaffId: user.staffId ?? null,
          customerPlanWalletId: original.customerPlanWalletId,
          bookingId: null, // refund tx 不綁 booking
          transactionType: "REFUND",
          paymentMethod: original.paymentMethod, // 退回原付款方式
          amount: new Prisma.Decimal(-plan.refundAmount),
          note: `[退款 v2 ${data.refundMode}] ${data.reason}`,
          // v2 refund 反向關聯 + meta
          refundOfTransactionId: original.id,
          refundReason: data.reason,
          refundedAt: now,
          refundedByUserId: user.id,
          ...refundSnapshot,
          // ⚠️ buildRefundSnapshot 會把 status 預設成 "REFUNDED"（v1 legacy 語意），
          // v2 不適用：原交易維持 SUCCESS，新 REFUND tx 本身也應該是 SUCCESS（
          // 代表「這筆退款交易成功完成」）。明確 override，避免報表 status 過濾把它擋掉。
          status: "SUCCESS",
          netAmount: new Prisma.Decimal(-plan.refundAmount),
        },
      });

      // ── 4. Audit log: REFUND ──
      await writeTransactionAuditLog(tx, {
        storeId: original.storeId,
        transactionId: original.id, // log 掛在「原交易」上，方便追溯
        actorUserId: user.id,
        action: "REFUND",
        before: { availableCount: plan.breakdown.availableCount, walletStatus: wallet.status },
        after: {
          availableCount: 0,
          walletStatus: newWalletStatus,
          refundTransactionId: created.id,
          refundAmount: plan.refundAmount,
          refundMode: data.refundMode,
        },
        reason: data.reason,
      });

      return created;
    });

    revalidateTransactions(original.customerId);
    return {
      success: true,
      data: { refundTransactionId: refundTx.id, refundAmount: plan.refundAmount },
    };
  } catch (e) {
    return handleActionError(e);
  }
}
