/**
 * 報表共用查詢邏輯
 *
 * 店營收 / 教練營收的 summary + details 查詢，供 API route 使用。
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ============================================================
// Types
// ============================================================

export interface ReportFilters {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  storeId?: string | null;
  coachId?: string | null;
  coachRole?: string | null;
  planType?: string | null;
  paymentMethod?: string | null;
  keyword?: string | null;
  storeFilter: Record<string, unknown>; // from getStoreFilter()
}

export interface StoreRevenueSummary {
  storeId: string;
  storeName: string;
  totalRevenue: number;
  refundAmount: number;
  netRevenue: number;
  txCount: number;
  customerCount: number;
  avgPerCustomer: number;
  trialRevenue: number;
  packageRevenue: number;
  singleRevenue: number;
  otherRevenue: number;
}

export interface CoachRevenueSummary {
  coachId: string;
  coachName: string;
  coachRole: string;
  storeName: string;
  totalRevenue: number;
  refundAmount: number;
  netRevenue: number;
  txCount: number;
  customerCount: number;
  avgPerTx: number;
  newCustomerRevenue: number;
  existingCustomerRevenue: number;
  trialRevenue: number;
  packageRevenue: number;
  singleRevenue: number;
  otherRevenue: number;
}

export interface TransactionDetail {
  id: string;
  transactionNo: string | null;
  transactionDate: string;
  storeName: string;
  customerName: string;
  customerPhone: string;
  coachName: string | null;
  coachRole: string | null;
  planName: string | null;
  planType: string | null;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  paymentMethod: string;
  status: string;
  isFirstPurchase: boolean;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
}

// ============================================================
// Where clause builder
// ============================================================

function buildWhereClause(filters: ReportFilters): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {
    ...filters.storeFilter,
    transactionDate: {
      gte: new Date(`${filters.startDate}T00:00:00+08:00`),
      lt: new Date(`${filters.endDate}T00:00:00+08:00`),
    },
    transactionType: {
      notIn: ["SESSION_DEDUCTION"], // 扣堂不計入營收
    },
  };

  if (filters.storeId) {
    where.storeId = filters.storeId;
  }
  if (filters.coachId) {
    where.revenueStaffId = filters.coachId;
  }
  if (filters.coachRole) {
    where.coachRoleSnapshot = filters.coachRole;
  }
  if (filters.planType) {
    where.planType = filters.planType;
  }
  if (filters.paymentMethod) {
    where.paymentMethod = filters.paymentMethod as Prisma.EnumPaymentMethodFilter;
  }
  if (filters.keyword) {
    where.OR = [
      { customer: { name: { contains: filters.keyword, mode: "insensitive" } } },
      { customer: { phone: { contains: filters.keyword } } },
      { planNameSnapshot: { contains: filters.keyword, mode: "insensitive" } },
      { transactionNo: { contains: filters.keyword, mode: "insensitive" } },
    ];
  }

  return where;
}

// ============================================================
// 店營收 Summary
// ============================================================

export async function getStoreRevenueSummary(
  filters: ReportFilters
): Promise<StoreRevenueSummary[]> {
  const where = buildWhereClause(filters);

  const transactions = await prisma.transaction.findMany({
    where,
    select: {
      storeId: true,
      storeNameSnapshot: true,
      netAmount: true,
      refundAmount: true,
      transactionType: true,
      planType: true,
      customerId: true,
      status: true,
      amount: true,
      store: { select: { name: true } },
    },
  });

  // Group by storeId
  const storeMap = new Map<string, {
    storeName: string;
    revenue: number;
    refund: number;
    count: number;
    customers: Set<string>;
    trial: number;
    pkg: number;
    single: number;
    other: number;
  }>();

  for (const tx of transactions) {
    const sid = tx.storeId;
    if (!storeMap.has(sid)) {
      storeMap.set(sid, {
        storeName: tx.storeNameSnapshot ?? tx.store?.name ?? "未知店舖",
        revenue: 0,
        refund: 0,
        count: 0,
        customers: new Set(),
        trial: 0,
        pkg: 0,
        single: 0,
        other: 0,
      });
    }
    const s = storeMap.get(sid)!;

    if (tx.status === "CANCELLED") continue;

    const net = Number(tx.netAmount);
    const refund = Number(tx.refundAmount);

    if (tx.transactionType !== "REFUND") {
      s.revenue += net;
      s.refund += refund;
      s.count++;
      s.customers.add(tx.customerId);

      if (tx.planType === "TRIAL") s.trial += net;
      else if (tx.planType === "PACKAGE") s.pkg += net;
      else if (tx.planType === "SINGLE") s.single += net;
      else s.other += net;
    }
  }

  return Array.from(storeMap.entries()).map(([storeId, s]) => {
    const netRevenue = s.revenue - s.refund;
    return {
      storeId,
      storeName: s.storeName,
      totalRevenue: s.revenue,
      refundAmount: s.refund,
      netRevenue,
      txCount: s.count,
      customerCount: s.customers.size,
      avgPerCustomer: s.customers.size > 0 ? Math.round(netRevenue / s.customers.size) : 0,
      trialRevenue: s.trial,
      packageRevenue: s.pkg,
      singleRevenue: s.single,
      otherRevenue: s.other,
    };
  });
}

// ============================================================
// 教練營收 Summary
// ============================================================

export async function getCoachRevenueSummary(
  filters: ReportFilters
): Promise<CoachRevenueSummary[]> {
  const where = buildWhereClause(filters);

  const transactions = await prisma.transaction.findMany({
    where,
    select: {
      revenueStaffId: true,
      coachNameSnapshot: true,
      coachRoleSnapshot: true,
      storeNameSnapshot: true,
      netAmount: true,
      refundAmount: true,
      transactionType: true,
      planType: true,
      customerId: true,
      isFirstPurchase: true,
      status: true,
      revenueStaff: { select: { displayName: true, user: { select: { role: true } } } },
      store: { select: { name: true } },
    },
  });

  const coachMap = new Map<string, {
    coachName: string;
    coachRole: string;
    storeName: string;
    revenue: number;
    refund: number;
    count: number;
    customers: Set<string>;
    newRevenue: number;
    existingRevenue: number;
    trial: number;
    pkg: number;
    single: number;
    other: number;
  }>();

  for (const tx of transactions) {
    const cid = tx.revenueStaffId;
    if (!coachMap.has(cid)) {
      coachMap.set(cid, {
        coachName: tx.coachNameSnapshot ?? tx.revenueStaff?.displayName ?? "未知教練",
        coachRole: tx.coachRoleSnapshot ?? tx.revenueStaff?.user?.role ?? "COACH",
        storeName: tx.storeNameSnapshot ?? tx.store?.name ?? "未知店舖",
        revenue: 0,
        refund: 0,
        count: 0,
        customers: new Set(),
        newRevenue: 0,
        existingRevenue: 0,
        trial: 0,
        pkg: 0,
        single: 0,
        other: 0,
      });
    }
    const c = coachMap.get(cid)!;

    if (tx.status === "CANCELLED") continue;

    const net = Number(tx.netAmount);
    const refund = Number(tx.refundAmount);

    if (tx.transactionType !== "REFUND") {
      c.revenue += net;
      c.refund += refund;
      c.count++;
      c.customers.add(tx.customerId);

      if (tx.isFirstPurchase) c.newRevenue += net;
      else c.existingRevenue += net;

      if (tx.planType === "TRIAL") c.trial += net;
      else if (tx.planType === "PACKAGE") c.pkg += net;
      else if (tx.planType === "SINGLE") c.single += net;
      else c.other += net;
    }
  }

  return Array.from(coachMap.entries()).map(([coachId, c]) => {
    const netRevenue = c.revenue - c.refund;
    return {
      coachId,
      coachName: c.coachName,
      coachRole: c.coachRole,
      storeName: c.storeName,
      totalRevenue: c.revenue,
      refundAmount: c.refund,
      netRevenue,
      txCount: c.count,
      customerCount: c.customers.size,
      avgPerTx: c.count > 0 ? Math.round(netRevenue / c.count) : 0,
      newCustomerRevenue: c.newRevenue,
      existingCustomerRevenue: c.existingRevenue,
      trialRevenue: c.trial,
      packageRevenue: c.pkg,
      singleRevenue: c.single,
      otherRevenue: c.other,
    };
  });
}

// ============================================================
// 明細查詢（分頁）
// ============================================================

export async function getTransactionDetails(
  filters: ReportFilters,
  page: number = 1,
  pageSize: number = 50
): Promise<{ data: TransactionDetail[]; total: number; page: number; pageSize: number }> {
  const where = buildWhereClause(filters);

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        customer: { select: { name: true, phone: true } },
        soldByStaff: { select: { displayName: true } },
        store: { select: { name: true } },
        revenueStaff: { select: { displayName: true, user: { select: { role: true } } } },
      },
      orderBy: { transactionDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);

  const data: TransactionDetail[] = transactions.map((tx) => ({
    id: tx.id,
    transactionNo: tx.transactionNo,
    transactionDate: tx.transactionDate.toISOString(),
    storeName: tx.storeNameSnapshot ?? tx.store?.name ?? "未知",
    customerName: tx.customer.name,
    customerPhone: tx.customer.phone,
    coachName: tx.coachNameSnapshot ?? tx.revenueStaff?.displayName ?? null,
    coachRole: tx.coachRoleSnapshot ?? tx.revenueStaff?.user?.role ?? null,
    planName: tx.planNameSnapshot,
    planType: tx.planType,
    grossAmount: Number(tx.grossAmount ?? tx.amount),
    discountAmount: Number(tx.discountAmount ?? 0),
    netAmount: Number(tx.netAmount),
    paymentMethod: tx.paymentMethod,
    status: tx.status,
    isFirstPurchase: tx.isFirstPurchase,
    note: tx.note,
    createdByName: tx.soldByStaff?.displayName ?? null,
    createdAt: tx.createdAt.toISOString(),
  }));

  return { data, total, page, pageSize };
}

// ============================================================
// KPI 彙總（用於前端卡片）
// ============================================================

export interface RevenueKpi {
  totalRevenue: number;
  refundAmount: number;
  netRevenue: number;
  txCount: number;
  customerCount: number;
  avgPerCustomer: number;
  newCustomerRevenue?: number;
  existingCustomerRevenue?: number;
}

export async function getRevenueKpi(
  filters: ReportFilters,
  includeNewExisting: boolean = false
): Promise<RevenueKpi> {
  const where = buildWhereClause(filters);

  const transactions = await prisma.transaction.findMany({
    where,
    select: {
      netAmount: true,
      refundAmount: true,
      transactionType: true,
      customerId: true,
      isFirstPurchase: true,
      status: true,
    },
  });

  let totalRevenue = 0;
  let refundAmount = 0;
  let newCustomerRevenue = 0;
  let existingCustomerRevenue = 0;
  let txCount = 0;
  const customers = new Set<string>();

  for (const tx of transactions) {
    if (tx.status === "CANCELLED") continue;
    if (tx.transactionType === "REFUND") continue;

    const net = Number(tx.netAmount);
    const refund = Number(tx.refundAmount);

    totalRevenue += net;
    refundAmount += refund;
    txCount++;
    customers.add(tx.customerId);

    if (includeNewExisting) {
      if (tx.isFirstPurchase) newCustomerRevenue += net;
      else existingCustomerRevenue += net;
    }
  }

  const netRevenue = totalRevenue - refundAmount;

  return {
    totalRevenue,
    refundAmount,
    netRevenue,
    txCount,
    customerCount: customers.size,
    avgPerCustomer: customers.size > 0 ? Math.round(netRevenue / customers.size) : 0,
    ...(includeNewExisting && { newCustomerRevenue, existingCustomerRevenue }),
  };
}
