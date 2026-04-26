import { prisma } from "@/lib/db";
import { requireSession, requireStaffSession } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { getManagerReadFilter, getStoreFilter, getVisibilityMode } from "@/lib/manager-visibility";
import type { TransactionType, PaymentMethod } from "@prisma/client";

export interface ListTransactionsOptions {
  customerId?: string;
  revenueStaffId?: string;
  transactionType?: TransactionType;
  paymentMethod?: PaymentMethod;
  dateFrom?: string; // "YYYY-MM-DD"
  dateTo?: string;
  excludeSessionDeduction?: boolean; // 排除 SESSION_DEDUCTION（金額=0的使用紀錄）
  page?: number;
  pageSize?: number;
}

// ============================================================
// listTransactions
// Owner: 全部
// Manager: 只有自己名下顧客的交易（revenueStaffId = user.staffId）
// ============================================================

export async function listTransactions(options: ListTransactionsOptions & { activeStoreId?: string | null } = {}) {
  const user = await requireStaffSession();
  const {
    customerId,
    revenueStaffId,
    transactionType,
    paymentMethod,
    dateFrom,
    dateTo,
    excludeSessionDeduction = false,
    activeStoreId,
    page = 1,
    pageSize = 30,
  } = options;

  // Manager 篩選（讀取型：受 visibility mode 控制）
  const visibilityFilter = getManagerReadFilter(user.role, user.staffId, "revenueStaffId", activeStoreId ?? user.storeId);
  // 若 UI 層有傳入 revenueStaffId 篩選，且 visibility 沒有強制篩選 → 使用 UI 篩選
  const staffFilter = Object.keys(visibilityFilter).length > 0
    ? visibilityFilter
    : revenueStaffId
    ? { revenueStaffId }
    : {};

  const where = {
    ...getStoreFilter(user, activeStoreId),
    ...staffFilter,
    ...(customerId ? { customerId } : {}),
    ...(transactionType ? { transactionType } : {}),
    ...(!transactionType && excludeSessionDeduction ? { transactionType: { not: "SESSION_DEDUCTION" as TransactionType } } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom ? { gte: new Date(dateFrom + "T00:00:00") } : {}),
            ...(dateTo ? { lte: new Date(dateTo + "T23:59:59") } : {}),
          },
        }
      : {}),
  };

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        revenueStaff: { select: { id: true, displayName: true } },
        serviceStaff: { select: { id: true, displayName: true } },
        customerPlanWallet: {
          select: {
            id: true,
            plan: { select: { name: true } },
            remainingSessions: true,
          },
        },
        booking: {
          select: { id: true, bookingDate: true, slotTime: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);

  return { transactions, total, page, pageSize };
}

// ============================================================
// getTransactionDetail
// ============================================================

export async function getTransactionDetail(transactionId: string) {
  const user = await requireSession();

  const tx = await prisma.transaction.findFirst({
    where: { id: transactionId, ...getStoreFilter(user) },
    include: {
      customer: { select: { id: true, name: true, assignedStaffId: true } },
      revenueStaff: { select: { id: true, displayName: true } },
      serviceStaff: { select: { id: true, displayName: true } },
      customerPlanWallet: {
        include: { plan: true },
      },
      booking: {
        select: {
          id: true,
          bookingDate: true,
          slotTime: true,
          bookingStatus: true,
        },
      },
    },
  });
  if (!tx) throw new AppError("NOT_FOUND", "交易紀錄不存在");

  // 非 Owner 員工讀取限制（受 visibility mode 控制）
  if (user.role !== "ADMIN" && user.role !== "CUSTOMER") {
    const mode = getVisibilityMode();
    if (mode === "SELF_ONLY") {
      if (!user.staffId || tx.revenueStaffId !== user.staffId) {
        throw new AppError("FORBIDDEN", "無法查看其他員工名下的交易");
      }
    }
  }

  return tx;
}

// ============================================================
// getCustomerTransactionSummary — 單一顧客的消費摘要
// ============================================================

export async function getCustomerTransactionSummary(customerId: string) {
  const user = await requireSession();

  // Customer 只能查自己
  if (user.role === "CUSTOMER") {
    if (!user.customerId || user.customerId !== customerId) {
      throw new AppError("FORBIDDEN", "只能查看自己的資料");
    }
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...getStoreFilter(user) },
    select: { id: true, assignedStaffId: true },
  });
  if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

  // 非 Owner 員工讀取限制（受 visibility mode 控制）
  if (user.role !== "ADMIN" && user.role !== "CUSTOMER") {
    const mode = getVisibilityMode();
    if (mode === "SELF_ONLY") {
      if (!user.staffId || customer.assignedStaffId !== user.staffId) {
        throw new AppError("FORBIDDEN", "無法查看其他員工名下的顧客");
      }
    }
  }

  const [totalSpent, transactionCount, deductionCount] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        customerId,
        transactionType: {
          in: ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE", "SUPPLEMENT"],
        },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.count({ where: { customerId } }),
    prisma.transaction.count({
      where: { customerId, transactionType: "SESSION_DEDUCTION" },
    }),
  ]);

  return {
    customerId,
    totalSpent: Number(totalSpent._sum.amount ?? 0),
    transactionCount,
    deductionCount, // 已消耗堂數
  };
}

// ============================================================
// getPendingPaymentTransactions — PR-4
// 後台待確認付款清單（TRANSFER / UNPAID 且 paymentStatus=PENDING）
// 按 createdAt asc（最舊的先顯示，督促店長處理）
// 附 totalAmount 聚合供 KPI 卡片使用
// ============================================================

// ============================================================
// countPendingPaymentTransactions
// 後台首頁通知卡用 — 與 getPendingPaymentTransactions 同一組 where 條件，
// 只回傳 count，避免 dashboard 首頁載入整批 row。
// ============================================================

export async function countPendingPaymentTransactions(options?: {
  activeStoreId?: string | null;
}): Promise<number> {
  const user = await requireStaffSession();
  return prisma.transaction.count({
    where: {
      ...getStoreFilter(user, options?.activeStoreId ?? null),
      paymentStatus: "PENDING" as const,
      paymentMethod: { in: ["TRANSFER", "UNPAID"] as PaymentMethod[] },
      status: { notIn: ["CANCELLED", "REFUNDED"] as ("CANCELLED" | "REFUNDED")[] },
    },
  });
}

// 處理狀態（店長視角）：
// - complete：可直接確認入帳（匯款 + 有轉帳資訊）
// - review  ：匯款但缺轉帳資訊，需先核對
// - unpaid  ：尚未付款
// - anomaly ：缺關鍵欄位（customerId / planId / amount），不可處理
export type PendingRowStatus = "complete" | "review" | "unpaid" | "anomaly";

function computeRowStatus(tx: {
  customerId: string | null;
  customerPlanWalletId: string | null;
  planNameSnapshot: string | null;
  amount: { toString(): string } | null;
  paymentMethod: PaymentMethod;
  transferLastFour: string | null;
  customerNote: string | null;
  bankLast5: string | null;
  referenceNo: string | null;
}): PendingRowStatus {
  const amountNum = tx.amount ? Number(tx.amount.toString()) : 0;
  const hasPlanRef = !!tx.customerPlanWalletId || !!tx.planNameSnapshot;
  if (!tx.customerId || !hasPlanRef || !amountNum || amountNum <= 0) {
    return "anomaly";
  }
  if (tx.paymentMethod === "UNPAID") return "unpaid";
  if (tx.paymentMethod === "TRANSFER") {
    const hasTransferInfo =
      !!tx.transferLastFour || !!tx.customerNote || !!tx.bankLast5 || !!tx.referenceNo;
    return hasTransferInfo ? "complete" : "review";
  }
  return "review";
}

const ROW_STATUS_ORDER: Record<PendingRowStatus, number> = {
  complete: 0,
  review: 1,
  unpaid: 2,
  anomaly: 3,
};

export async function getPendingPaymentTransactions(options?: {
  activeStoreId?: string | null;
  page?: number;
  pageSize?: number;
}) {
  const user = await requireStaffSession();
  const { activeStoreId, page = 1, pageSize = 30 } = options ?? {};

  const where = {
    ...getStoreFilter(user, activeStoreId),
    paymentStatus: "PENDING" as const,
    paymentMethod: { in: ["TRANSFER", "UNPAID"] as PaymentMethod[] },
    status: { notIn: ["CANCELLED", "REFUNDED"] as ("CANCELLED" | "REFUNDED")[] },
  };

  const [rows, total, sum] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        revenueStaff: { select: { id: true, displayName: true } },
        soldByStaff: { select: { id: true, displayName: true } },
        customerPlanWallet: {
          select: { id: true, plan: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({
      where,
      _sum: { amount: true },
    }),
  ]);

  // 標註處理狀態並依「complete → review → unpaid → anomaly，組內 createdAt asc」排序
  const transactions = rows
    .map((tx) => ({ ...tx, rowStatus: computeRowStatus(tx) }))
    .sort((a, b) => {
      const diff = ROW_STATUS_ORDER[a.rowStatus] - ROW_STATUS_ORDER[b.rowStatus];
      if (diff !== 0) return diff;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

  const confirmableCount = transactions.filter((t) => t.rowStatus === "complete").length;

  return {
    transactions,
    total,
    totalAmount: Number(sum._sum?.amount ?? 0),
    confirmableCount,
    page,
    pageSize,
  };
}
