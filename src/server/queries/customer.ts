import { prisma } from "@/lib/db";
import { requireSession, requireStaffSession } from "@/lib/session";
import { AppError } from "@/lib/errors";
import type { CustomerStage } from "@prisma/client";

export interface ListCustomersOptions {
  stage?: CustomerStage;
  search?: string; // name / phone / email
  assignedStaffId?: string; // 篩選直屬店長
  page?: number;
  pageSize?: number;
}

// ============================================================
// listCustomers
// Owner + Manager: 所有顧客（共享查看）
// Manager 也能看全部，但修改受權限控制
// ============================================================

export async function listCustomers(options: ListCustomersOptions = {}) {
  const user = await requireStaffSession();
  const { stage, search, assignedStaffId, page = 1, pageSize = 20 } = options;

  // 不再依 Manager 隔離 — 所有店長都能看全部顧客
  const where = {
    ...(stage ? { customerStage: stage } : {}),
    ...(assignedStaffId ? { assignedStaffId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search } },
            { email: { contains: search, mode: "insensitive" as const } },
            { lineName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        user: { select: { email: true } },
        assignedStaff: { select: { id: true, displayName: true, colorCode: true } },
        planWallets: {
          where: { status: "ACTIVE" },
          select: { remainingSessions: true },
        },
        _count: {
          select: {
            bookings: { where: { bookingStatus: { in: ["PENDING", "CONFIRMED"] } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  // 計算每位顧客的剩餘堂數總計
  const customersWithStats = customers.map((c) => ({
    ...c,
    totalRemainingSessions: c.planWallets.reduce(
      (sum, w) => sum + w.remainingSessions,
      0
    ),
  }));

  return { customers: customersWithStats, total, page, pageSize };
}

// ============================================================
// searchCustomers — 用於 autocomplete（輕量版）
// ============================================================

export async function searchCustomers(query: string, limit = 10) {
  await requireStaffSession();

  if (!query || query.length < 1) return [];

  return prisma.customer.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { phone: { contains: query } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      customerStage: true,
      assignedStaff: { select: { displayName: true, colorCode: true } },
      planWallets: {
        where: { status: "ACTIVE" },
        select: { remainingSessions: true },
      },
    },
    orderBy: { name: "asc" },
    take: limit,
  });
}

// ============================================================
// getCustomerDetail
// Owner: 任意顧客
// Manager: 可查看任何顧客（共享查看），但修改受權限控制
// Customer: 只有自己
// ============================================================

export async function getCustomerDetail(customerId: string) {
  const user = await requireSession();

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      user: { select: { email: true, image: true } },
      assignedStaff: {
        select: { id: true, displayName: true, colorCode: true },
      },
      planWallets: {
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      },
      bookings: {
        orderBy: { bookingDate: "desc" },
        take: 20,
        include: {
          revenueStaff: { select: { displayName: true } },
          serviceStaff: { select: { displayName: true } },
        },
      },
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

  // Manager 現在可以查看所有顧客（共享查看）
  // 只有 CUSTOMER 角色限制只看自己
  if (user.role === "CUSTOMER") {
    if (!user.customerId || user.customerId !== customerId) {
      throw new AppError("FORBIDDEN", "只能查看自己的資料");
    }
  }

  return customer;
}
