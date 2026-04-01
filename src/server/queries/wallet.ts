import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { AppError } from "@/lib/errors";

// ============================================================
// listCustomerWallets
// Owner: 任意顧客
// Manager: 自己名下顧客
// Customer: 自己
// ============================================================

export async function listCustomerWallets(customerId: string) {
  const user = await requireSession();

  // 先取顧客做權限驗證
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, assignedStaffId: true },
  });
  if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

  if (user.role === "MANAGER") {
    if (!user.staffId || customer.assignedStaffId !== user.staffId) {
      throw new AppError("FORBIDDEN", "無法查看其他店長名下顧客的課程錢包");
    }
  }
  if (user.role === "CUSTOMER") {
    if (!user.customerId || user.customerId !== customerId) {
      throw new AppError("FORBIDDEN", "只能查看自己的課程錢包");
    }
  }

  return prisma.customerPlanWallet.findMany({
    where: { customerId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
}

// ============================================================
// getActiveWallet — 取顧客最舊的 ACTIVE wallet（預約時使用）
// ============================================================

export async function getActiveWallet(customerId: string) {
  const user = await requireSession();

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { assignedStaffId: true },
  });
  if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

  if (user.role === "MANAGER") {
    if (!user.staffId || customer.assignedStaffId !== user.staffId) {
      throw new AppError("FORBIDDEN", "無法查看其他店長名下顧客的課程錢包");
    }
  }
  if (user.role === "CUSTOMER") {
    if (!user.customerId || user.customerId !== customerId) {
      throw new AppError("FORBIDDEN", "只能查看自己的課程錢包");
    }
  }

  // 回傳最早的 ACTIVE wallet（FIFO 消費原則）
  return prisma.customerPlanWallet.findFirst({
    where: { customerId, status: "ACTIVE" },
    include: { plan: true },
    orderBy: { createdAt: "asc" },
  });
}

// ============================================================
// getTotalRemainingSessionsForCustomer — 計算顧客總剩餘堂數
// ============================================================

export async function getTotalRemainingSessionsForCustomer(customerId: string) {
  const wallets = await prisma.customerPlanWallet.findMany({
    where: { customerId, status: "ACTIVE" },
    select: { remainingSessions: true },
  });
  return wallets.reduce((sum, w) => sum + w.remainingSessions, 0);
}
