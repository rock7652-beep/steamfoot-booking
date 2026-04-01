import { prisma } from "@/lib/db";
import { requireSession, requireStaffSession } from "@/lib/session";
import { AppError } from "@/lib/errors";
import type { TransactionType, PaymentMethod } from "@prisma/client";

export interface ListTransactionsOptions {
  customerId?: string;
  revenueStaffId?: string;
  transactionType?: TransactionType;
  paymentMethod?: PaymentMethod;
  dateFrom?: string; // "YYYY-MM-DD"
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

// ============================================================
// listTransactions
// Owner: 全部
// Manager: 只有自己名下顧客的交易（revenueStaffId = user.staffId）
// ============================================================

export async function listTransactions(options: ListTransactionsOptions = {}) {
  const user = await requireStaffSession();
  const {
    customerId,
    revenueStaffId,
    transactionType,
    paymentMethod,
    dateFrom,
    dateTo,
    page = 1,
    pageSize = 30,
  } = options;

  // Manager 強制過濾
  const staffFilter =
    user.role === "MANAGER" && user.staffId
      ? { revenueStaffId: user.staffId }
      : revenueStaffId
      ? { revenueStaffId }
      : {};

  const where = {
    ...staffFilter,
    ...(customerId ? { customerId } : {}),
    ...(transactionType ? { transactionType } : {}),
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

  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
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

  // Manager 只能看自己名下顧客的交易
  if (user.role === "MANAGER") {
    if (!user.staffId || tx.revenueStaffId !== user.staffId) {
      throw new AppError("FORBIDDEN", "無法查看其他店長名下的交易");
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

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, assignedStaffId: true },
  });
  if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

  // Manager 只能查自己名下
  if (user.role === "MANAGER") {
    if (!user.staffId || customer.assignedStaffId !== user.staffId) {
      throw new AppError("FORBIDDEN", "無法查看其他店長名下的顧客");
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
