import { prisma } from "@/lib/db";
import { requireSession, requireStaffSession } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { getStoreFilter } from "@/lib/manager-visibility";
import { monthRange, toLocalMonthStr } from "@/lib/date-utils";
import type { CustomerStage, Prisma } from "@prisma/client";

/**
 * 桌機版顧客列表 toolbar 支援的複合篩選：
 * - status     狀態（合併 customerStage + LINE 綁定）
 *                 linked   LINE 已綁定
 *                 unlinked LINE 未綁定
 *                 lead     名單（未成為顧客）
 *                 customer 顧客（已體驗 / 已購課 / 已停用）
 * - visit      來店
 *                 month    本月曾到店
 *                 stale30  超過 30 天未到店（排除從未到店）
 *                 never    從未到店
 * - referral   推薦
 *                 has      有推薦紀錄（曾介紹過顧客）
 *                 none     無推薦紀錄
 * - sort       最近來店 / 建立時間 / 累積點數
 */
export type CustomerListStatus = "linked" | "unlinked" | "lead" | "customer";
export type CustomerListVisit = "month" | "stale30" | "never";
export type CustomerListReferral = "has" | "none";
export type CustomerListSort = "recent" | "created" | "points";

export interface ListCustomersOptions {
  stage?: CustomerStage;
  status?: CustomerListStatus;
  visit?: CustomerListVisit;
  referral?: CustomerListReferral;
  search?: string; // name / phone / email / lineName
  assignedStaffId?: string; // 篩選直屬店長
  sort?: CustomerListSort;
  page?: number;
  pageSize?: number;
}

// ============================================================
// listCustomers
// Owner + Manager: 所有顧客（共享查看）
// Manager 也能看全部，但修改受權限控制
// ============================================================

export async function listCustomers(options: ListCustomersOptions & { activeStoreId?: string | null } = {}) {
  const user = await requireStaffSession();
  const {
    stage,
    status,
    visit,
    referral,
    search,
    assignedStaffId,
    sort = "recent",
    activeStoreId,
    page = 1,
    pageSize = 20,
  } = options;

  // ----- 狀態（LINE 綁定 / 顧客階段）-----
  const statusWhere: Prisma.CustomerWhereInput =
    status === "linked"
      ? { lineLinkStatus: "LINKED" }
      : status === "unlinked"
        ? { lineLinkStatus: { not: "LINKED" } }
        : status === "lead"
          ? { customerStage: "LEAD" }
          : status === "customer"
            ? { customerStage: { not: "LEAD" } }
            : {};

  // ----- 來店（本月 / 30 天未到 / 從未到）-----
  // 以 Asia/Taipei 月首為界；`lt` cutoff 語意自動排除 null（Postgres 比較不含 null）
  const monthStart = monthRange(toLocalMonthStr()).start;
  const stale30Cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const visitWhere: Prisma.CustomerWhereInput =
    visit === "month"
      ? { lastVisitAt: { gte: monthStart } }
      : visit === "stale30"
        ? { lastVisitAt: { lt: stale30Cutoff } }
        : visit === "never"
          ? { lastVisitAt: null }
          : {};

  // ----- 推薦紀錄（曾介紹過其他顧客）-----
  const referralWhere: Prisma.CustomerWhereInput =
    referral === "has"
      ? { sponsoredCustomers: { some: {} } }
      : referral === "none"
        ? { sponsoredCustomers: { none: {} } }
        : {};

  // 不再依 Manager 隔離 — 所有店長都能看全部顧客
  const where: Prisma.CustomerWhereInput = {
    ...getStoreFilter(user, activeStoreId),
    ...(stage ? { customerStage: stage } : {}),
    ...(assignedStaffId ? { assignedStaffId } : {}),
    ...statusWhere,
    ...visitWhere,
    ...referralWhere,
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

  // ----- 排序 -----
  // lastVisitAt 可能為 null → 用 nulls:"last" 避免空資料排前面（Prisma 6 支援）
  const orderBy: Prisma.CustomerOrderByWithRelationInput[] =
    sort === "created"
      ? [{ createdAt: "desc" }]
      : sort === "points"
        ? [{ totalPoints: "desc" }, { createdAt: "desc" }]
        : [{ lastVisitAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        user: { select: { email: true } },
        assignedStaff: { select: { id: true, displayName: true, colorCode: true } },
        sponsor: { select: { id: true, name: true } },
        planWallets: {
          where: { status: "ACTIVE" },
          select: { remainingSessions: true },
        },
        _count: { select: { sponsoredCustomers: true } },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  // 計算每位顧客的剩餘堂數總計 + 推薦數
  const customersWithStats = customers.map((c) => ({
    ...c,
    totalRemainingSessions: c.planWallets.reduce(
      (sum, w) => sum + w.remainingSessions,
      0
    ),
    sponsoredCount: c._count.sponsoredCustomers,
  }));

  return { customers: customersWithStats, total, page, pageSize };
}

// ============================================================
// searchCustomers — 用於 autocomplete（輕量版）
// ============================================================

export async function searchCustomers(query: string, limit = 10, activeStoreId?: string | null) {
  const user = await requireStaffSession();

  if (!query || query.length < 1) return [];

  return prisma.customer.findMany({
    where: {
      ...getStoreFilter(user, activeStoreId),
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

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...getStoreFilter(user) },
    include: {
      user: { select: { email: true, image: true, status: true } },
      assignedStaff: {
        select: { id: true, displayName: true, colorCode: true },
      },
      sponsor: { select: { id: true, name: true, phone: true } },
      // UI 使用的 count：sponsoredCustomers 推薦人數、bookings 累積到店次數
      // 注意：若使用不存在的 enum 值（例如尚未 merge 的 CHECKED_IN），Prisma 型別會
      // 退化成 base Customer，導致 `.planWallets` 等 relation 在 build 時消失。
      // 目前 main schema 的「完成到店」終態就是 COMPLETED。
      _count: {
        select: {
          sponsoredCustomers: true,
          bookings: { where: { bookingStatus: "COMPLETED" } },
        },
      },
      planWallets: {
        include: {
          plan: {
            select: { id: true, name: true, category: true, sessionCount: true, price: true },
          },
        },
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
