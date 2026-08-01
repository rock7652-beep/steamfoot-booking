/**
 * 報表共用查詢邏輯
 *
 * 店營收 / 教練營收的 summary + details 查詢，供 API route 使用。
 */

// TODO(PR-payment-confirm): PR-3/4 上線「轉帳待確認」後，本檔內所有 Transaction 營收查詢
// （groupBy/aggregate/findMany 帶 status: { not: "CANCELLED" }）必須加 paymentStatus filter：
//   where: { paymentStatus: { in: ["SUCCESS", "CONFIRMED"] } }
// 本 PR-1 不加：歷史交易 backfill=SUCCESS，現行報表語意與上線前完全一致。

import { prisma } from "@/lib/db";
import { Prisma, PaymentMethod } from "@prisma/client";
import { paymentMethodReportAmount } from "@/lib/payment-splits";

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
    // New mixed payments contribute their split amount to payment-method reports;
    // this filter only selects relevant transactions for details. Aggregate totals
    // must use getPaymentMethodRevenueSummary below rather than Transaction.amount.
    where.AND = [
      {
        OR: [
          { paymentSplits: { some: { paymentMethod: filters.paymentMethod as PaymentMethod } } },
          { paymentSplits: { none: {} }, paymentMethod: filters.paymentMethod as PaymentMethod },
        ],
      },
    ];
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

/** Payment-method report that counts each Transaction once in revenue but assigns
 * its amount by TransactionPaymentSplit. Historical rows without splits retain
 * their original single paymentMethod. */
export async function getPaymentMethodRevenueSummary(filters: ReportFilters) {
  const base = buildWhereClause({ ...filters, paymentMethod: null });
  const active: Prisma.TransactionWhereInput = {
    ...base,
    status: { notIn: ["CANCELLED", "VOIDED"] },
    transactionType: { notIn: ["SESSION_DEDUCTION", "REFUND"] },
  };
  const [splitRows, legacyRows] = await Promise.all([
    prisma.transactionPaymentSplit.groupBy({
      by: ["paymentMethod"],
      where: { transaction: active },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ["paymentMethod"],
      where: { ...active, paymentSplits: { none: {} } },
      _sum: { netAmount: true },
    }),
  ]);
  const totals = new Map<string, number>();
  for (const row of splitRows) totals.set(row.paymentMethod, Number(row._sum.amount ?? 0));
  for (const row of legacyRows) totals.set(row.paymentMethod, (totals.get(row.paymentMethod) ?? 0) + Number(row._sum.netAmount ?? 0));
  return Array.from(totals, ([paymentMethod, amount]) => ({ paymentMethod, amount }));
}

/** The one amount a payment-method-filtered report may attribute to a transaction.
 * A split row replaces the legacy transaction-level payment method; it never adds
 * a second copy of the transaction's revenue. */
function selectedPaymentAmount(
  tx: { paymentMethod: PaymentMethod; netAmount: Prisma.Decimal; paymentSplits: Array<{ paymentMethod: PaymentMethod; amount: Prisma.Decimal }> },
  paymentMethod: PaymentMethod,
): number {
  if (tx.paymentSplits.length === 0) {
    return paymentMethodReportAmount({
      paymentMethod: tx.paymentMethod,
      amount: Number(tx.netAmount),
      paymentSplits: [],
    }, paymentMethod);
  }
  return paymentMethodReportAmount({
    paymentMethod: tx.paymentMethod,
    amount: Number(tx.netAmount),
    paymentSplits: tx.paymentSplits.map((split) => ({ paymentMethod: split.paymentMethod, amount: Number(split.amount) })),
  }, paymentMethod);
}

function activeRevenueWhere(filters: ReportFilters): Prisma.TransactionWhereInput {
  const where = buildWhereClause(filters);
  return {
    ...where,
    status: { notIn: ["CANCELLED", "VOIDED"] },
    transactionType: { notIn: ["SESSION_DEDUCTION", "REFUND"] },
  };
}

async function getPaymentFilteredRevenueTransactions(filters: ReportFilters) {
  return prisma.transaction.findMany({
    where: activeRevenueWhere(filters),
    select: {
      storeId: true,
      storeNameSnapshot: true,
      planType: true,
      customerId: true,
      revenueStaffId: true,
      coachNameSnapshot: true,
      coachRoleSnapshot: true,
      isFirstPurchase: true,
      paymentMethod: true,
      netAmount: true,
      refundAmount: true,
      paymentSplits: { select: { paymentMethod: true, amount: true } },
      store: { select: { name: true } },
      revenueStaff: { select: { displayName: true, user: { select: { role: true } } } },
    },
  });
}

function paymentFilteredRefundAmount(
  tx: { netAmount: Prisma.Decimal; refundAmount: Prisma.Decimal | null },
  selectedAmount: number,
): number {
  const total = Number(tx.netAmount);
  return total === 0 ? 0 : Math.round(Number(tx.refundAmount ?? 0) * (selectedAmount / total));
}

// ============================================================
// 店營收 Summary
// ============================================================

export async function getStoreRevenueSummary(
  filters: ReportFilters
): Promise<StoreRevenueSummary[]> {
  if (filters.paymentMethod) return getStoreRevenueSummaryByPaymentMethod(filters);
  const where = buildWhereClause(filters);

  // 排除 CANCELLED / REFUND — 交由 DB 層過濾，不再於 JS 端 skip
  const whereActive: Prisma.TransactionWhereInput = {
    ...where,
    status: { notIn: ["CANCELLED", "VOIDED"] },
    transactionType: {
      ...((where.transactionType as Prisma.EnumTransactionTypeFilter | undefined) ?? {}),
      // buildWhereClause 已排除 SESSION_DEDUCTION；這裡再疊上排除 REFUND
      notIn: ["SESSION_DEDUCTION", "REFUND"],
    },
  };

  // 三支 DB-side 聚合平行跑，取代一次 findMany + in-memory group
  const [byStoreAndPlan, distinctPairs, storeMetaRaw] = await Promise.all([
    // 1. 每店 x planType 的 revenue / refund / tx count（groupBy 直接回聚合數字）
    prisma.transaction.groupBy({
      by: ["storeId", "planType"],
      where: whereActive,
      _sum: { netAmount: true, refundAmount: true },
      _count: { id: true },
    }),
    // 2. 每店去重顧客 — 只抓 (storeId, customerId) 配對，不拉其他欄位
    prisma.transaction.findMany({
      where: whereActive,
      distinct: ["storeId", "customerId"],
      select: { storeId: true, customerId: true },
    }),
    // 3. 店名 fallback：先抓每店第一筆 snapshot + store name，避免 N+1
    prisma.transaction.findMany({
      where: whereActive,
      distinct: ["storeId"],
      select: { storeId: true, storeNameSnapshot: true, store: { select: { name: true } } },
    }),
  ]);

  // 組 storeMap：以 groupBy 結果為主，in-memory 只做加總而不做 row-by-row scan
  const storeMap = new Map<string, {
    storeName: string;
    revenue: number;
    refund: number;
    count: number;
    trial: number;
    pkg: number;
    single: number;
    other: number;
  }>();

  const storeMeta = new Map<string, string>();
  for (const m of storeMetaRaw) {
    storeMeta.set(m.storeId, m.storeNameSnapshot ?? m.store?.name ?? "未知店舖");
  }

  for (const row of byStoreAndPlan) {
    const sid = row.storeId;
    const net = Number(row._sum.netAmount ?? 0);
    const refund = Number(row._sum.refundAmount ?? 0);
    const cnt = row._count.id;

    if (!storeMap.has(sid)) {
      storeMap.set(sid, {
        storeName: storeMeta.get(sid) ?? "未知店舖",
        revenue: 0,
        refund: 0,
        count: 0,
        trial: 0,
        pkg: 0,
        single: 0,
        other: 0,
      });
    }
    const s = storeMap.get(sid)!;
    s.revenue += net;
    s.refund += refund;
    s.count += cnt;
    if (row.planType === "TRIAL") s.trial += net;
    else if (row.planType === "PACKAGE") s.pkg += net;
    else if (row.planType === "SINGLE") s.single += net;
    else s.other += net;
  }

  // 去重顧客數：distinct pairs 計數
  const customerCountByStore = new Map<string, number>();
  for (const p of distinctPairs) {
    customerCountByStore.set(p.storeId, (customerCountByStore.get(p.storeId) ?? 0) + 1);
  }

  return Array.from(storeMap.entries()).map(([storeId, s]) => {
    const netRevenue = s.revenue - s.refund;
    const customerCount = customerCountByStore.get(storeId) ?? 0;
    return {
      storeId,
      storeName: s.storeName,
      totalRevenue: s.revenue,
      refundAmount: s.refund,
      netRevenue,
      txCount: s.count,
      customerCount,
      avgPerCustomer: customerCount > 0 ? Math.round(netRevenue / customerCount) : 0,
      trialRevenue: s.trial,
      packageRevenue: s.pkg,
      singleRevenue: s.single,
      otherRevenue: s.other,
    };
  });
}

async function getStoreRevenueSummaryByPaymentMethod(filters: ReportFilters): Promise<StoreRevenueSummary[]> {
  const paymentMethod = filters.paymentMethod as PaymentMethod;
  const rows = await getPaymentFilteredRevenueTransactions(filters);
  const stores = new Map<string, StoreRevenueSummary>();
  const customers = new Map<string, Set<string>>();
  for (const row of rows) {
    const amount = selectedPaymentAmount(row, paymentMethod);
    if (amount === 0) continue;
    const current = stores.get(row.storeId) ?? {
      storeId: row.storeId, storeName: row.storeNameSnapshot ?? row.store?.name ?? "未知店舖",
      totalRevenue: 0, refundAmount: 0, netRevenue: 0, txCount: 0, customerCount: 0,
      avgPerCustomer: 0, trialRevenue: 0, packageRevenue: 0, singleRevenue: 0, otherRevenue: 0,
    };
    current.totalRevenue += amount;
    current.refundAmount += paymentFilteredRefundAmount(row, amount);
    current.txCount += 1;
    if (row.planType === "TRIAL") current.trialRevenue += amount;
    else if (row.planType === "PACKAGE") current.packageRevenue += amount;
    else if (row.planType === "SINGLE") current.singleRevenue += amount;
    else current.otherRevenue += amount;
    stores.set(row.storeId, current);
    const storeCustomers = customers.get(row.storeId) ?? new Set<string>();
    storeCustomers.add(row.customerId);
    customers.set(row.storeId, storeCustomers);
  }
  return Array.from(stores.values()).map((store) => {
    store.customerCount = customers.get(store.storeId)?.size ?? 0;
    store.netRevenue = store.totalRevenue - store.refundAmount;
    store.avgPerCustomer = store.customerCount > 0 ? Math.round(store.netRevenue / store.customerCount) : 0;
    return store;
  });
}

// ============================================================
// 教練營收 Summary
// ============================================================

export async function getCoachRevenueSummary(
  filters: ReportFilters
): Promise<CoachRevenueSummary[]> {
  if (filters.paymentMethod) return getCoachRevenueSummaryByPaymentMethod(filters);
  const where = buildWhereClause(filters);

  const whereActive: Prisma.TransactionWhereInput = {
    ...where,
    status: { notIn: ["CANCELLED", "VOIDED"] },
    transactionType: {
      ...((where.transactionType as Prisma.EnumTransactionTypeFilter | undefined) ?? {}),
      notIn: ["SESSION_DEDUCTION", "REFUND"],
    },
  };

  const [byCoachPlan, byCoachFirstPurchase, distinctCustomerPairs, coachMetaRaw] =
    await Promise.all([
      // 每教練 x planType 的 revenue/refund/count
      prisma.transaction.groupBy({
        by: ["revenueStaffId", "planType"],
        where: whereActive,
        _sum: { netAmount: true, refundAmount: true },
        _count: { id: true },
      }),
      // 每教練 x isFirstPurchase 的 revenue — 用於 new / existing 分流
      prisma.transaction.groupBy({
        by: ["revenueStaffId", "isFirstPurchase"],
        where: whereActive,
        _sum: { netAmount: true },
      }),
      // 每教練去重顧客
      prisma.transaction.findMany({
        where: whereActive,
        distinct: ["revenueStaffId", "customerId"],
        select: { revenueStaffId: true, customerId: true },
      }),
      // 每教練 meta（名稱 / 角色 / 店名）— 第一筆 snapshot
      prisma.transaction.findMany({
        where: whereActive,
        distinct: ["revenueStaffId"],
        select: {
          revenueStaffId: true,
          coachNameSnapshot: true,
          coachRoleSnapshot: true,
          storeNameSnapshot: true,
          revenueStaff: { select: { displayName: true, user: { select: { role: true } } } },
          store: { select: { name: true } },
        },
      }),
    ]);

  const coachMap = new Map<
    string,
    {
      coachName: string;
      coachRole: string;
      storeName: string;
      revenue: number;
      refund: number;
      count: number;
      newRevenue: number;
      existingRevenue: number;
      trial: number;
      pkg: number;
      single: number;
      other: number;
    }
  >();

  for (const m of coachMetaRaw) {
    coachMap.set(m.revenueStaffId, {
      coachName: m.coachNameSnapshot ?? m.revenueStaff?.displayName ?? "未知教練",
      coachRole: m.coachRoleSnapshot ?? m.revenueStaff?.user?.role ?? "PARTNER",
      storeName: m.storeNameSnapshot ?? m.store?.name ?? "未知店舖",
      revenue: 0,
      refund: 0,
      count: 0,
      newRevenue: 0,
      existingRevenue: 0,
      trial: 0,
      pkg: 0,
      single: 0,
      other: 0,
    });
  }

  for (const row of byCoachPlan) {
    const cid = row.revenueStaffId;
    const c = coachMap.get(cid);
    if (!c) continue;
    const net = Number(row._sum.netAmount ?? 0);
    const refund = Number(row._sum.refundAmount ?? 0);
    c.revenue += net;
    c.refund += refund;
    c.count += row._count.id;
    if (row.planType === "TRIAL") c.trial += net;
    else if (row.planType === "PACKAGE") c.pkg += net;
    else if (row.planType === "SINGLE") c.single += net;
    else c.other += net;
  }

  for (const row of byCoachFirstPurchase) {
    const cid = row.revenueStaffId;
    const c = coachMap.get(cid);
    if (!c) continue;
    const net = Number(row._sum.netAmount ?? 0);
    if (row.isFirstPurchase) c.newRevenue += net;
    else c.existingRevenue += net;
  }

  const customerCountByCoach = new Map<string, number>();
  for (const p of distinctCustomerPairs) {
    customerCountByCoach.set(p.revenueStaffId, (customerCountByCoach.get(p.revenueStaffId) ?? 0) + 1);
  }

  return Array.from(coachMap.entries()).map(([coachId, c]) => {
    const netRevenue = c.revenue - c.refund;
    const customerCount = customerCountByCoach.get(coachId) ?? 0;
    return {
      coachId,
      coachName: c.coachName,
      coachRole: c.coachRole,
      storeName: c.storeName,
      totalRevenue: c.revenue,
      refundAmount: c.refund,
      netRevenue,
      txCount: c.count,
      customerCount,
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

async function getCoachRevenueSummaryByPaymentMethod(filters: ReportFilters): Promise<CoachRevenueSummary[]> {
  const paymentMethod = filters.paymentMethod as PaymentMethod;
  const rows = await getPaymentFilteredRevenueTransactions(filters);
  const coaches = new Map<string, CoachRevenueSummary>();
  const customers = new Map<string, Set<string>>();
  for (const row of rows) {
    const amount = selectedPaymentAmount(row, paymentMethod);
    if (amount === 0) continue;
    const current = coaches.get(row.revenueStaffId) ?? {
      coachId: row.revenueStaffId,
      coachName: row.coachNameSnapshot ?? row.revenueStaff?.displayName ?? "未知教練",
      coachRole: row.coachRoleSnapshot ?? row.revenueStaff?.user?.role ?? "PARTNER",
      storeName: row.storeNameSnapshot ?? row.store?.name ?? "未知店舖",
      totalRevenue: 0, refundAmount: 0, netRevenue: 0, txCount: 0, customerCount: 0, avgPerTx: 0,
      newCustomerRevenue: 0, existingCustomerRevenue: 0, trialRevenue: 0, packageRevenue: 0, singleRevenue: 0, otherRevenue: 0,
    };
    current.totalRevenue += amount;
    current.refundAmount += paymentFilteredRefundAmount(row, amount);
    current.txCount += 1;
    if (row.isFirstPurchase) current.newCustomerRevenue += amount;
    else current.existingCustomerRevenue += amount;
    if (row.planType === "TRIAL") current.trialRevenue += amount;
    else if (row.planType === "PACKAGE") current.packageRevenue += amount;
    else if (row.planType === "SINGLE") current.singleRevenue += amount;
    else current.otherRevenue += amount;
    coaches.set(row.revenueStaffId, current);
    const coachCustomers = customers.get(row.revenueStaffId) ?? new Set<string>();
    coachCustomers.add(row.customerId);
    customers.set(row.revenueStaffId, coachCustomers);
  }
  return Array.from(coaches.values()).map((coach) => {
    coach.customerCount = customers.get(coach.coachId)?.size ?? 0;
    coach.netRevenue = coach.totalRevenue - coach.refundAmount;
    coach.avgPerTx = coach.txCount > 0 ? Math.round(coach.netRevenue / coach.txCount) : 0;
    return coach;
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
  if (filters.paymentMethod) return getRevenueKpiByPaymentMethod(filters, includeNewExisting);
  const where = buildWhereClause(filters);

  // 排除 CANCELLED / REFUND — DB-side 處理，不再拉全量 rows
  const whereActive: Prisma.TransactionWhereInput = {
    ...where,
    status: { notIn: ["CANCELLED", "VOIDED"] },
    transactionType: {
      ...((where.transactionType as Prisma.EnumTransactionTypeFilter | undefined) ?? {}),
      notIn: ["SESSION_DEDUCTION", "REFUND"],
    },
  };

  // 三支聚合平行：整體總和 / 去重顧客數 /（選）新客 vs 既有客
  const newExistingPromise: Promise<Array<{ isFirstPurchase: boolean; _sum: { netAmount: unknown } }>> =
    includeNewExisting
      ? (prisma.transaction.groupBy({
          by: ["isFirstPurchase"],
          where: whereActive,
          _sum: { netAmount: true },
        }) as unknown as Promise<Array<{ isFirstPurchase: boolean; _sum: { netAmount: unknown } }>>)
      : Promise.resolve([]);

  const [totals, distinctCustomers, newExistingRaw] = await Promise.all([
    prisma.transaction.aggregate({
      where: whereActive,
      _sum: { netAmount: true, refundAmount: true },
      _count: { id: true },
    }),
    prisma.transaction.findMany({
      where: whereActive,
      distinct: ["customerId"],
      select: { customerId: true },
    }),
    newExistingPromise,
  ]);

  const totalRevenue = Number(totals._sum.netAmount ?? 0);
  const refundAmount = Number(totals._sum.refundAmount ?? 0);
  const txCount = totals._count.id;
  const customerCount = distinctCustomers.length;
  const netRevenue = totalRevenue - refundAmount;

  let newCustomerRevenue = 0;
  let existingCustomerRevenue = 0;
  if (includeNewExisting) {
    for (const row of newExistingRaw) {
      const sum = Number(row._sum.netAmount ?? 0);
      if (row.isFirstPurchase) newCustomerRevenue += sum;
      else existingCustomerRevenue += sum;
    }
  }

  return {
    totalRevenue,
    refundAmount,
    netRevenue,
    txCount,
    customerCount,
    avgPerCustomer: customerCount > 0 ? Math.round(netRevenue / customerCount) : 0,
    ...(includeNewExisting && { newCustomerRevenue, existingCustomerRevenue }),
  };
}

async function getRevenueKpiByPaymentMethod(filters: ReportFilters, includeNewExisting: boolean): Promise<RevenueKpi> {
  const paymentMethod = filters.paymentMethod as PaymentMethod;
  const rows = await getPaymentFilteredRevenueTransactions(filters);
  let totalRevenue = 0;
  let refundAmount = 0;
  let newCustomerRevenue = 0;
  let existingCustomerRevenue = 0;
  const customers = new Set<string>();
  let txCount = 0;
  for (const row of rows) {
    const amount = selectedPaymentAmount(row, paymentMethod);
    if (amount === 0) continue;
    totalRevenue += amount;
    refundAmount += paymentFilteredRefundAmount(row, amount);
    txCount += 1;
    customers.add(row.customerId);
    if (row.isFirstPurchase) newCustomerRevenue += amount;
    else existingCustomerRevenue += amount;
  }
  const netRevenue = totalRevenue - refundAmount;
  return {
    totalRevenue, refundAmount, netRevenue, txCount, customerCount: customers.size,
    avgPerCustomer: customers.size > 0 ? Math.round(netRevenue / customers.size) : 0,
    ...(includeNewExisting && { newCustomerRevenue, existingCustomerRevenue }),
  };
}
