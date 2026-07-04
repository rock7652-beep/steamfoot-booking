import { prisma } from "@/lib/db";
import { bookingMonthRange, dayRange, monthRange, toLocalMonthStr } from "@/lib/date-utils";
import {
  REVENUE_NET_TYPES,
  REVENUE_TRANSACTION_TYPES,
  REVENUE_VALID_STATUS,
} from "@/lib/booking-constants";

export interface AdvancedReportsInput {
  storeId?: string | null;
  /** YYYY-MM. Used when startDate/endDate are omitted. */
  month?: string;
  /** YYYY-MM-DD, inclusive. */
  startDate?: string;
  /** YYYY-MM-DD, inclusive. */
  endDate?: string;
  /** Customer is active when lastVisitAt is within this many days before range end. */
  activeDays?: number;
  /** Customer is dormant when lastVisitAt or createdAt is older than this many days before range end. */
  dormantDays?: number;
  /** Number of months to include in the monthly revenue trend. */
  trendMonths?: number;
}

export interface RateMetric {
  numerator: number;
  denominator: number;
  rate: number;
}

export interface CustomerActivityMetric {
  activeCustomers: number;
  dormantCustomers: number;
  totalCustomers: number;
}

export interface AverageOrderValueMetric {
  revenue: number;
  transactionCount: number;
  averageOrderValue: number;
}

export interface MonthlyStoreRevenuePoint {
  month: string;
  storeId: string;
  storeName: string;
  revenue: number;
  transactionCount: number;
}

export interface AdvancedReportsMetrics {
  range: {
    startDate: string;
    endDate: string;
    transactionStart: Date;
    transactionEnd: Date;
    bookingStart: Date;
    bookingEnd: Date;
  };
  trialConversion: RateMetric;
  renewal: RateMetric;
  revisit: RateMetric;
  averageOrderValue: AverageOrderValueMetric;
  customerActivity: CustomerActivityMetric;
  monthlyRevenueTrend: MonthlyStoreRevenuePoint[];
}

const PAID_PAYMENT_STATUSES = ["SUCCESS", "CONFIRMED"] as const;

function resolveReportRange(input: AdvancedReportsInput): AdvancedReportsMetrics["range"] {
  if (input.startDate && input.endDate) {
    const start = dayRange(input.startDate);
    const end = dayRange(input.endDate);
    return {
      startDate: input.startDate,
      endDate: input.endDate,
      transactionStart: start.start,
      transactionEnd: end.end,
      bookingStart: bookingDate(input.startDate),
      bookingEnd: bookingDate(input.endDate),
    };
  }

  const month = input.month ?? toLocalMonthStr();
  const [year, mon] = month.split("-").map(Number);
  const transactionRange = monthRange(month);
  const bookingRange = bookingMonthRange(year, mon);
  return {
    startDate: `${month}-01`,
    endDate: bookingRange.end.toISOString().slice(0, 10),
    transactionStart: transactionRange.start,
    transactionEnd: transactionRange.end,
    bookingStart: bookingRange.start,
    bookingEnd: bookingRange.end,
  };
}

function bookingDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function storeWhere(storeId?: string | null) {
  return storeId ? { storeId } : {};
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function countDistinct(values: string[]): number {
  return new Set(values).size;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function monthKey(date: Date): string {
  return toLocalMonthStr(date);
}

function subtractMonths(month: string, months: number): string {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, mon - 1 - months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function money(value: unknown): number {
  return Number(value ?? 0);
}

async function computeTrialConversion(
  range: AdvancedReportsMetrics["range"],
  storeId?: string | null,
): Promise<RateMetric> {
  const trialBookings = await prisma.booking.findMany({
    where: {
      ...storeWhere(storeId),
      bookingType: "FIRST_TRIAL",
      bookingStatus: "COMPLETED",
      bookingDate: { gte: range.bookingStart, lte: range.bookingEnd },
    },
    select: { customerId: true },
  });
  const trialCustomerIds = unique(trialBookings.map((booking) => booking.customerId));
  if (trialCustomerIds.length === 0) {
    return { numerator: 0, denominator: 0, rate: 0 };
  }

  const convertedCustomers = await prisma.customer.findMany({
    where: {
      ...storeWhere(storeId),
      id: { in: trialCustomerIds },
      convertedAt: { not: null, lte: range.transactionEnd },
    },
    select: { id: true },
  });

  return {
    numerator: countDistinct(convertedCustomers.map((customer) => customer.id)),
    denominator: trialCustomerIds.length,
    rate: rate(convertedCustomers.length, trialCustomerIds.length),
  };
}

async function computeRenewal(
  range: AdvancedReportsMetrics["range"],
  storeId?: string | null,
): Promise<RateMetric> {
  const walletsInRange = await prisma.customerPlanWallet.findMany({
    where: {
      ...storeWhere(storeId),
      createdAt: { gte: range.transactionStart, lte: range.transactionEnd },
    },
    select: { customerId: true },
  });
  const buyerIds = unique(walletsInRange.map((wallet) => wallet.customerId));
  if (buyerIds.length === 0) return { numerator: 0, denominator: 0, rate: 0 };

  const priorWallets = await prisma.customerPlanWallet.findMany({
    where: {
      ...storeWhere(storeId),
      customerId: { in: buyerIds },
      createdAt: { lt: range.transactionStart },
    },
    select: { customerId: true },
  });
  const renewingCustomerCount = countDistinct(priorWallets.map((wallet) => wallet.customerId));

  return {
    numerator: renewingCustomerCount,
    denominator: buyerIds.length,
    rate: rate(renewingCustomerCount, buyerIds.length),
  };
}

async function computeRevisit(
  range: AdvancedReportsMetrics["range"],
  storeId?: string | null,
): Promise<RateMetric> {
  const [priorVisits, currentVisits] = await Promise.all([
    prisma.booking.findMany({
      where: {
        ...storeWhere(storeId),
        bookingStatus: "COMPLETED",
        bookingDate: { lt: range.bookingStart },
      },
      select: { customerId: true },
    }),
    prisma.booking.findMany({
      where: {
        ...storeWhere(storeId),
        bookingStatus: "COMPLETED",
        bookingDate: { gte: range.bookingStart, lte: range.bookingEnd },
      },
      select: { customerId: true },
    }),
  ]);
  const priorCustomerIds = unique(priorVisits.map((booking) => booking.customerId));
  if (priorCustomerIds.length === 0) return { numerator: 0, denominator: 0, rate: 0 };

  const currentCustomerIds = new Set(currentVisits.map((booking) => booking.customerId));
  const returningCustomerCount = priorCustomerIds.filter((id) => currentCustomerIds.has(id)).length;

  return {
    numerator: returningCustomerCount,
    denominator: priorCustomerIds.length,
    rate: rate(returningCustomerCount, priorCustomerIds.length),
  };
}

async function computeAverageOrderValue(
  range: AdvancedReportsMetrics["range"],
  storeId?: string | null,
): Promise<AverageOrderValueMetric> {
  const result = await prisma.transaction.aggregate({
    where: {
      ...storeWhere(storeId),
      transactionType: { in: [...REVENUE_TRANSACTION_TYPES] },
      status: REVENUE_VALID_STATUS,
      paymentStatus: { in: [...PAID_PAYMENT_STATUSES] },
      transactionDate: { gte: range.transactionStart, lte: range.transactionEnd },
    },
    _sum: { amount: true },
    _count: { id: true },
  });
  const revenue = money(result._sum.amount);
  const transactionCount = result._count.id;
  return {
    revenue,
    transactionCount,
    averageOrderValue: transactionCount > 0 ? Math.round(revenue / transactionCount) : 0,
  };
}

async function computeCustomerActivity(
  range: AdvancedReportsMetrics["range"],
  input: AdvancedReportsInput,
): Promise<CustomerActivityMetric> {
  const activeSince = daysBefore(range.transactionEnd, input.activeDays ?? 30);
  const dormantBefore = daysBefore(range.transactionEnd, input.dormantDays ?? 60);
  const filter = storeWhere(input.storeId);

  const [totalCustomers, activeCustomers, dormantCustomers] = await Promise.all([
    prisma.customer.count({ where: filter }),
    prisma.customer.count({
      where: {
        ...filter,
        lastVisitAt: { gte: activeSince },
      },
    }),
    prisma.customer.count({
      where: {
        ...filter,
        OR: [
          { lastVisitAt: { lt: dormantBefore } },
          { lastVisitAt: null, createdAt: { lt: dormantBefore } },
        ],
      },
    }),
  ]);

  return { activeCustomers, dormantCustomers, totalCustomers };
}

async function computeMonthlyRevenueTrend(
  range: AdvancedReportsMetrics["range"],
  input: AdvancedReportsInput,
): Promise<MonthlyStoreRevenuePoint[]> {
  const endMonth = input.month ?? monthKey(range.transactionEnd);
  const trendStartMonth = subtractMonths(endMonth, Math.max((input.trendMonths ?? 6) - 1, 0));
  const trendStart = monthRange(trendStartMonth).start;

  const transactions = await prisma.transaction.findMany({
    where: {
      ...storeWhere(input.storeId),
      transactionType: { in: [...REVENUE_NET_TYPES] },
      status: REVENUE_VALID_STATUS,
      paymentStatus: { in: [...PAID_PAYMENT_STATUSES] },
      transactionDate: { gte: trendStart, lte: range.transactionEnd },
    },
    select: {
      storeId: true,
      storeNameSnapshot: true,
      transactionDate: true,
      amount: true,
      store: { select: { name: true } },
    },
    orderBy: [{ transactionDate: "asc" }, { storeId: "asc" }],
  });

  const points = new Map<string, MonthlyStoreRevenuePoint>();
  for (const tx of transactions) {
    const month = monthKey(tx.transactionDate);
    const key = `${month}:${tx.storeId}`;
    const existing = points.get(key);
    if (existing) {
      existing.revenue += money(tx.amount);
      existing.transactionCount += 1;
    } else {
      points.set(key, {
        month,
        storeId: tx.storeId,
        storeName: tx.storeNameSnapshot ?? tx.store.name,
        revenue: money(tx.amount),
        transactionCount: 1,
      });
    }
  }

  return [...points.values()].sort((a, b) =>
    a.month === b.month ? a.storeName.localeCompare(b.storeName) : a.month.localeCompare(b.month),
  );
}

export async function getAdvancedReportsMetrics(
  input: AdvancedReportsInput = {},
): Promise<AdvancedReportsMetrics> {
  const range = resolveReportRange(input);
  const [
    trialConversion,
    renewal,
    revisit,
    averageOrderValue,
    customerActivity,
    monthlyRevenueTrend,
  ] = await Promise.all([
    computeTrialConversion(range, input.storeId),
    computeRenewal(range, input.storeId),
    computeRevisit(range, input.storeId),
    computeAverageOrderValue(range, input.storeId),
    computeCustomerActivity(range, input),
    computeMonthlyRevenueTrend(range, input),
  ]);

  return {
    range,
    trialConversion,
    renewal,
    revisit,
    averageOrderValue,
    customerActivity,
    monthlyRevenueTrend,
  };
}
