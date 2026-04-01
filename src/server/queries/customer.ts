import { prisma } from "@/lib/db";
import { requireSession, requireStaffSession } from "@/lib/session";
import { AppError } from "@/lib/errors";
import type { CustomerStage } from "@prisma/client";

export interface ListCustomersOptions {
  stage?: CustomerStage;
  search?: string; // name / phone
  page?: number;
  pageSize?: number;
}

// ============================================================
// listCustomers
// Owner: 所有顧客
// Manager: 只有自己名下顧客（後端強制過濾）
// ============================================================

export async function listCustomers(options: ListCustomersOptions = {}) {
  const user = await requireStaffSession();
  const { stage, search, page = 1, pageSize = 20 } = options;

  // Manager 資料隔離：後端強制過濾
  const staffFilter =
    user.role === "MANAGER" && user.staffId
      ? { assignedStaffId: user.staffId }
      : {};

  const where = {
    ...staffFilter,
    ...(stage ? { customerStage: stage } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { phone: { contains: search } },
            { lineName: { contains: search } },
          ],
        }
      : {}),
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        assignedStaff: { select: { id: true, displayName: true, colorCode: true } },
        _count: {
          select: {
            bookings: { where: { bookingStatus: { in: ["PENDING", "CONFIRMED"] } } },
            planWallets: { where: { status: "ACTIVE" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return { customers, total, page, pageSize };
}

// ============================================================
// getCustomerDetail
// Owner: 任意顧客
// Manager: 只有自己名下
// Customer: 只有自己
// ============================================================

export async function getCustomerDetail(customerId: string) {
  const user = await requireSession();

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
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

  // 後端強制權限檢查
  if (user.role === "MANAGER") {
    if (!user.staffId || customer.assignedStaffId !== user.staffId) {
      throw new AppError("FORBIDDEN", "無法查看其他店長名下的顧客");
    }
  }
  if (user.role === "CUSTOMER") {
    if (!user.customerId || user.customerId !== customerId) {
      throw new AppError("FORBIDDEN", "只能查看自己的資料");
    }
  }

  return customer;
}
