"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { AppError, handleActionError } from "@/lib/errors";
import { assignPlanSchema } from "@/lib/validators/plan";
import type { ActionResult } from "@/types";
import { addDays } from "date-fns";
import { assertStoreAccess, getStoreFilter } from "@/lib/manager-visibility";
import { currentStoreId } from "@/lib/store";
import { buildTransactionSnapshot } from "@/lib/transaction-snapshot";
import { awardFirstTopupReferralPointsIfEligible } from "@/server/services/referral-points";
import { resolveCustomerStaffAssignment } from "@/server/services/customer-assignment";
import {
  seedWalletSessions,
  reconcileForManualAdjust,
  voidAvailableSession,
  WalletSessionError,
} from "@/server/services/wallet-session";
import { getStoreContext } from "@/lib/store-context";
import { resolveCustomerForUser } from "@/server/queries/customer-completion";

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

    // PR-3：付款確認語意
    // TRANSFER / UNPAID → 需店長在 PR-4 confirmTransactionPayment 確認後才算入帳
    // 其他付款方式（CASH / LINE_PAY / CREDIT_CARD / OTHER）→ 建單即視為成功收款
    const isPending =
      data.paymentMethod === "TRANSFER" || data.paymentMethod === "UNPAID";
    const paymentStatus = isPending ? "PENDING" : "SUCCESS";
    const paidAt = isPending ? null : now;

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

      // 1b. 建立 N 筆 AVAILABLE 單堂明細（PR-1 wallet-session）
      await seedWalletSessions(tx, wallet.id, plan.sessionCount);

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

      const transaction = await tx.transaction.create({
        data: {
          customerId: data.customerId,
          revenueStaffId, // 快照：營收歸屬
          soldByStaffId: user.staffId ?? null, // 紀錄本次操作/成交店長
          transactionType: txType,
          paymentMethod: data.paymentMethod,
          paymentStatus,                          // PR-3：PENDING (TRANSFER/UNPAID) or SUCCESS
          paidAt,                                  // PR-3：null (PENDING) or now
          referenceNo: data.referenceNo ?? null,   // PR-3：轉帳參考號
          bankLast5: data.bankLast5 ?? null,       // PR-3：轉帳帳號末五碼
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

      // 3. 更新顧客狀態 + 發首儲推薦獎勵
      // PR-3：PENDING 交易（轉帳待確認 / 未付款）先不鎖 convertedAt、不升等、不發獎勵
      // 這些邏輯留給 PR-4 confirmTransactionPayment 在 PENDING → CONFIRMED 時統一觸發
      const isFirstPurchase = !customer.convertedAt;
      if (!isPending) {
        await tx.customer.update({
          where: { id: data.customerId },
          data: {
            customerStage: "ACTIVE",
            selfBookingEnabled: true,
            ...(isFirstPurchase && { convertedAt: now }),
          },
        });

        // 推薦獎勵：首次購課 + 有 sponsor → 邀請者 +15、被邀請者 +5
        // sourceKey 以 customerId 為主鍵；靜默失敗
        await awardFirstTopupReferralPointsIfEligible({
          customerId: data.customerId,
          storeId: currentStoreId(user),
          isFirstPurchase,
          tx,
        });
      }

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
      // 同步 session row（保持 remainingSessions == AVAILABLE+RESERVED 不變式）
      // reconcileForManualAdjust 結束時會內部呼叫 refreshWalletCounter，
      // 因此 wallet.remainingSessions / status 由 service 寫入，不需另呼 update。
      try {
        await reconcileForManualAdjust(tx, {
          walletId,
          newRemaining,
          voidedByStaffId: user.staffId ?? null,
        });
      } catch (e) {
        if (e instanceof WalletSessionError) {
          throw new AppError("BUSINESS_RULE", e.message);
        }
        throw e;
      }

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

// ============================================================
// voidWalletSession — 店長手動註銷單一堂（AVAILABLE → VOIDED）
//
// 用途：顧客退費 / 補償調整 / 部分作廢時，註銷尚未使用的堂數。
// 權限：wallet.adjust（與 adjustRemainingSessions 同層級，OWNER 才有）
// 限制：
//   - 必須 AVAILABLE 才可註銷（COMPLETED / RESERVED / VOIDED 拒絕）
//   - 已綁定預約 (RESERVED) 需先取消預約
//   - 註銷不可逆，不會自動產生退費 Transaction（退費另由財務模組處理）
//
// 副作用：
//   - WalletSession.status = VOIDED, voidedAt/voidReason/voidedByStaffId
//   - wallet.remainingSessions 同步遞減（service 內部處理）
//   - 寫一筆 Transaction(ADJUSTMENT, amount=0) 作 audit
// ============================================================

const voidSessionSchema = z.object({
  sessionId: z.string().min(1),
  reason: z.string().min(1, "註銷原因不能為空").max(200),
});

export async function voidWalletSession(
  input: z.infer<typeof voidSessionSchema>
): Promise<ActionResult<{ walletId: string; sessionNo: number }>> {
  try {
    const user = await requirePermission("wallet.adjust");
    const data = voidSessionSchema.parse(input);

    const session = await prisma.walletSession.findUnique({
      where: { id: data.sessionId },
      select: {
        id: true,
        sessionNo: true,
        status: true,
        wallet: {
          select: { id: true, customerId: true, storeId: true },
        },
      },
    });
    if (!session) throw new AppError("NOT_FOUND", "找不到此堂明細");
    assertStoreAccess(user, session.wallet.storeId);

    const result = await prisma.$transaction(async (tx) => {
      const voided = await voidAvailableSession(tx, {
        sessionId: data.sessionId,
        voidReason: data.reason,
        voidedByStaffId: user.staffId!,
      });

      // Audit transaction（amount=0，僅紀錄）
      const customer = await tx.customer.findUnique({
        where: { id: session.wallet.customerId },
        select: { assignedStaffId: true },
      });
      const revenueStaffId = customer?.assignedStaffId ?? user.staffId!;
      const snapshot = await buildTransactionSnapshot(tx, {
        customerId: session.wallet.customerId,
        storeId: session.wallet.storeId,
        revenueStaffId,
        planId: null,
        grossAmount: 0,
        netAmount: 0,
      });
      await tx.transaction.create({
        data: {
          customerId: session.wallet.customerId,
          revenueStaffId,
          soldByStaffId: user.staffId ?? null,
          transactionType: "ADJUSTMENT",
          paymentMethod: "CASH",
          amount: 0,
          quantity: -1,
          customerPlanWalletId: session.wallet.id,
          note: `註銷第 ${voided.sessionNo} 堂：${data.reason}`,
          storeId: session.wallet.storeId,
          ...snapshot,
        },
      });

      return voided;
    });

    revalidatePath(`/dashboard/customers/${session.wallet.customerId}`);
    return { success: true, data: result };
  } catch (e) {
    if (e instanceof WalletSessionError) {
      return { success: false, error: e.message };
    }
    return handleActionError(e);
  }
}

// ============================================================
// getLatestActiveWalletSummary — PR-5.5 drawer 用
//
// 快速指派 drawer 讀取顧客最近一筆 ACTIVE wallet，用於：
//   - 顯示「目前方案」精簡卡片（方案名 / 剩餘堂數 / 到期日）
//   - 「續購同方案」按鈕的 planId 來源
//
// 權限：wallet.read（OWNER / PARTNER 皆有）
// 作用域：依 getStoreFilter 做店隔離
// 回傳序列化形態：expiryDate 轉 ISO string，避免 server action RPC 邊界問題
// ============================================================

export interface DrawerWalletSummary {
  id: string;
  remainingSessions: number;
  expiryDate: string | null;
  plan: { id: string; name: string };
}

export async function getLatestActiveWalletSummary(
  customerId: string
): Promise<DrawerWalletSummary | null> {
  const user = await requirePermission("wallet.read");

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...getStoreFilter(user) },
    select: { id: true },
  });
  if (!customer) return null;

  const wallet = await prisma.customerPlanWallet.findFirst({
    where: { customerId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      remainingSessions: true,
      expiryDate: true,
      plan: { select: { id: true, name: true } },
    },
  });

  if (!wallet) return null;

  return {
    id: wallet.id,
    remainingSessions: wallet.remainingSessions,
    expiryDate: wallet.expiryDate ? wallet.expiryDate.toISOString() : null,
    plan: wallet.plan,
  };
}

// ============================================================
// initiateCustomerPlanPurchase — PR-6
//
// 顧客端自助購買入口（前台 /book/shop/[planId]/checkout）。
//
// 嚴格限制（和 assignPlanToCustomer 區分的護欄）：
//   - 只接受 planId；不接受 paymentMethod / 折扣 / referenceNo / bankLast5
//   - paymentMethod 強制 TRANSFER
//   - paymentStatus 強制 PENDING；paidAt = null（待店長在 /dashboard/payments 確認）
//   - 不觸發 customer 升等、不發首儲推薦獎勵（PR-3 gate 沿用）
//   - 三向同店：user.customerId → customer.storeId === plan.storeId
//   - 僅允許 isActive=true AND publicVisible=true 的方案
// ============================================================

const initiateCustomerPurchaseSchema = z.object({
  planId: z.string().cuid(),
  // 顧客自填轉帳末四碼（必填，4 位數字）
  transferLastFour: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "末四碼需為 4 位數字"),
  // 顧客自填備註（選填，最長 500 字）
  customerNote: z.string().trim().max(500).optional(),
});

export async function initiateCustomerPlanPurchase(
  input: z.infer<typeof initiateCustomerPurchaseSchema>
): Promise<ActionResult<{ transactionId: string; walletId: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new AppError("FORBIDDEN", "請先登入後再購買");
    const data = initiateCustomerPurchaseSchema.parse(input);

    // ── URL store 為主：方案必須屬於本店；顧客也以本店 scoped resolver 找出 ──
    // 修正前邏輯用 customer.storeId 對照 plan.storeId，session 殘留別店 customerId 時整頁 404。
    const storeCtx = await getStoreContext();
    if (!storeCtx) throw new AppError("UNAUTHORIZED", "缺少店舖 context，請從正確的分店入口進入");
    const urlStoreId = storeCtx.storeId;

    const plan = await prisma.servicePlan.findFirst({
      where: { id: data.planId, storeId: urlStoreId },
    });
    if (!plan) throw new AppError("NOT_FOUND", "方案不存在或不屬於本店");
    if (!plan.isActive || !plan.publicVisible) {
      throw new AppError("BUSINESS_RULE", "此方案目前不開放購買");
    }

    const resolved = await resolveCustomerForUser({
      userId: user.id,
      sessionCustomerId: user.customerId ?? null,
      sessionEmail: user.email ?? null,
      storeId: urlStoreId,
      storeSlug: storeCtx.storeSlug,
    });
    if (!resolved.customer) {
      throw new AppError("NOT_FOUND", "請先到「我的資料」完成本店顧客資料後再購買");
    }
    const customer = await prisma.customer.findUnique({
      where: { id: resolved.customer.id },
      select: { id: true, storeId: true, convertedAt: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客資料不存在");
    if (customer.storeId !== urlStoreId) {
      throw new AppError("FORBIDDEN", "此方案不屬於您的店別");
    }

    const originalPrice = Number(plan.price);
    const now = new Date();
    const expiryDate = plan.validityDays ? addDays(now, plan.validityDays) : null;

    const txType =
      plan.category === "TRIAL"
        ? "TRIAL_PURCHASE"
        : plan.category === "SINGLE"
        ? "SINGLE_PURCHASE"
        : "PACKAGE_PURCHASE";

    const result = await prisma.$transaction(async (tx) => {
      // 解析顧客歸屬店長（existing / referral_staff / sponsor_staff / store_owner）
      // 若 customer.assignedStaffId 為空或失效，helper 會自動寫回 store owner 等 fallback
      const assignment = await resolveCustomerStaffAssignment(
        customer.id,
        customer.storeId,
        { tx }
      );
      const revenueStaffId = assignment.staffId;

      const wallet = await tx.customerPlanWallet.create({
        data: {
          customerId: customer.id,
          planId: plan.id,
          purchasedPrice: originalPrice,
          totalSessions: plan.sessionCount,
          remainingSessions: plan.sessionCount,
          startDate: now,
          expiryDate,
          status: "ACTIVE",
          storeId: customer.storeId,
        },
      });

      // 建立 N 筆 AVAILABLE 單堂明細（PR-1 wallet-session）
      await seedWalletSessions(tx, wallet.id, plan.sessionCount);

      const snapshot = await buildTransactionSnapshot(tx, {
        customerId: customer.id,
        storeId: customer.storeId,
        revenueStaffId,
        planId: plan.id,
        grossAmount: originalPrice,
        netAmount: originalPrice,
      });

      const transaction = await tx.transaction.create({
        data: {
          customerId: customer.id,
          revenueStaffId,
          soldByStaffId: null, // 顧客自助購買，無操作店長
          transactionType: txType,
          paymentMethod: "TRANSFER",
          paymentStatus: "PENDING",
          paidAt: null,
          amount: originalPrice,
          customerPlanWalletId: wallet.id,
          note: "顧客線上申請購買（轉帳待確認）",
          transferLastFour: data.transferLastFour,
          customerNote: data.customerNote ?? null,
          storeId: customer.storeId,
          ...snapshot,
        },
      });

      // PR-3 gate：PENDING 不動 customer 狀態、不發獎，等 PR-4 confirmTransactionPayment 觸發
      return { wallet, transaction, assignmentSource: assignment.source };
    });

    // 紀錄歸屬解析結果（Vercel logs），方便未來 audit 顧客歸屬異常
    if (result.assignmentSource !== "existing") {
      console.info("[initiateCustomerPlanPurchase] customer staff auto-assigned", {
        customerId: customer.id,
        source: result.assignmentSource,
        transactionId: result.transaction.id,
      });
    }

    revalidatePath("/my-plans");
    revalidatePath("/dashboard/payments"); // 店長端即時看到
    return {
      success: true,
      data: { transactionId: result.transaction.id, walletId: result.wallet.id },
    };
  } catch (e) {
    return handleActionError(e);
  }
}
