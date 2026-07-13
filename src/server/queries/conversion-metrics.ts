import { prisma } from "@/lib/db";
import { bookingMonthRange, monthRange, toLocalDateStr } from "@/lib/date-utils";

export type ConversionComparison = {
  difference: number;
  percentage: number | null;
};

export type ConversionMetric = {
  current: number;
  mom: ConversionComparison;
  yoy: ConversionComparison;
};

export type ConversionMetrics = {
  month: string;
  convertedCustomers: ConversionMetric;
  conversionRate: ConversionMetric;
  unconvertedCustomers: ConversionMetric;
};

export type CompletedTrial = {
  customerId: string;
  bookingDate: Date;
};

export type PackagePurchase = {
  customerId: string;
  transactionDate: Date;
  customerPlanWallet: { status: string } | null;
};

type ConversionCounts = {
  convertedCustomers: number;
  conversionRate: number;
  unconvertedCustomers: number;
};

function shiftMonth(month: string, offset: number): string {
  const [year, mon] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, mon - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function bookingRangeForMonth(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return bookingMonthRange(year, mon);
}

function compare(current: number, baseline: number): ConversionComparison {
  return {
    difference: current - baseline,
    percentage: baseline === 0 ? null : ((current - baseline) / baseline) * 100,
  };
}

function countsForMonth(
  month: string,
  trials: CompletedTrial[],
  purchases: PackagePurchase[],
): ConversionCounts {
  const selection = selectConversionCustomerIds(month, trials, purchases);
  const trialCustomers = selection.trialCustomerIds.size;
  const convertedCustomers = selection.convertedCustomerIds.size;
  return {
    convertedCustomers,
    conversionRate: trialCustomers === 0 ? 0 : (convertedCustomers / trialCustomers) * 100,
    unconvertedCustomers: trialCustomers - convertedCustomers,
  };
}

export type ConversionCustomerSelection = {
  trialCustomerIds: Set<string>;
  convertedCustomerIds: Set<string>;
  unconvertedCustomerIds: Set<string>;
};

/** KPI count 與 CRM list 共用的唯一 customerId selection。 */
export function selectConversionCustomerIds(
  month: string,
  trials: CompletedTrial[],
  purchases: PackagePurchase[],
): ConversionCustomerSelection {
  const trialDatesByCustomer = new Map<string, Set<string>>();
  for (const trial of trials) {
    const trialDate = trial.bookingDate.toISOString().slice(0, 10);
    if (!trialDate.startsWith(`${month}-`)) continue;
    const dates = trialDatesByCustomer.get(trial.customerId) ?? new Set<string>();
    dates.add(trialDate);
    trialDatesByCustomer.set(trial.customerId, dates);
  }

  const convertedCustomerIds = new Set<string>();
  for (const purchase of purchases) {
    const trialDates = trialDatesByCustomer.get(purchase.customerId);
    if (!trialDates) continue;
    if (!purchase.customerPlanWallet || purchase.customerPlanWallet.status === "CANCELLED") continue;
    if (trialDates.has(toLocalDateStr(purchase.transactionDate))) {
      convertedCustomerIds.add(purchase.customerId);
    }
  }

  const trialCustomerIds = new Set(trialDatesByCustomer.keys());
  const unconvertedCustomerIds = new Set(
    [...trialCustomerIds].filter((customerId) => !convertedCustomerIds.has(customerId)),
  );
  return { trialCustomerIds, convertedCustomerIds, unconvertedCustomerIds };
}

export function buildConversionMetrics(
  month: string,
  trials: CompletedTrial[],
  purchases: PackagePurchase[],
): ConversionMetrics {
  const previousMonth = shiftMonth(month, -1);
  const previousYearMonth = shiftMonth(month, -12);
  const current = countsForMonth(month, trials, purchases);
  const previous = countsForMonth(previousMonth, trials, purchases);
  const previousYear = countsForMonth(previousYearMonth, trials, purchases);

  const metric = (key: keyof ConversionCounts): ConversionMetric => ({
    current: current[key],
    mom: compare(current[key], previous[key]),
    yoy: compare(current[key], previousYear[key]),
  });

  return {
    month,
    convertedCustomers: metric("convertedCustomers"),
    conversionRate: metric("conversionRate"),
    unconvertedCustomers: metric("unconvertedCustomers"),
  };
}

/**
 * 開卡 = 同店、同一台灣日完成 FIRST_TRIAL 並成功購買正式方案，且 Wallet 未取消。
 * Booking 只有一個 customerId，因此不使用 people / attendedPeople；同行者未各自建檔時不計。
 */
export async function getConversionMetrics(
  storeId: string,
  month: string,
): Promise<ConversionMetrics> {
  const months = [month, shiftMonth(month, -1), shiftMonth(month, -12)];
  const { trials, purchases } = await loadConversionFacts(storeId, months);
  return buildConversionMetrics(month, trials, purchases);
}

async function loadConversionFacts(storeId: string, months: string[]) {
  const bookingRanges = months.map(bookingRangeForMonth);
  const trials = await prisma.booking.findMany({
    where: {
      storeId,
      bookingStatus: "COMPLETED",
      bookingType: "FIRST_TRIAL",
      OR: bookingRanges.map(({ start, end }) => ({ bookingDate: { gte: start, lte: end } })),
    },
    select: { customerId: true, bookingDate: true },
  });

  const customerIds = [...new Set(trials.map((trial) => trial.customerId))];
  const timestampRanges = months.map(monthRange);
  const purchases = customerIds.length
    ? await prisma.transaction.findMany({
        where: {
          storeId,
          customerId: { in: customerIds },
          transactionType: "PACKAGE_PURCHASE",
          status: "SUCCESS",
          paymentStatus: { in: ["SUCCESS", "CONFIRMED"] },
          customerPlanWalletId: { not: null },
          OR: timestampRanges.map(({ start, end }) => ({
            transactionDate: { gte: start, lte: end },
          })),
        },
        select: {
          customerId: true,
          transactionDate: true,
          customerPlanWallet: { select: { status: true } },
        },
      })
    : [];

  return { trials, purchases };
}

export type MonthlyUnconvertedCustomer = {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  trialCompletedAt: Date;
  assignedStaffName: string | null;
  lastFollowUp: {
    createdAt: Date;
    createdByName: string;
  } | null;
};

export async function getMonthlyUnconvertedCustomers(
  storeId: string,
  month: string,
): Promise<MonthlyUnconvertedCustomer[]> {
  const { trials, purchases } = await loadConversionFacts(storeId, [month]);
  const selection = selectConversionCustomerIds(month, trials, purchases);
  const customerIds = [...selection.unconvertedCustomerIds];
  if (customerIds.length === 0) return [];

  const customers = await prisma.customer.findMany({
    where: { storeId, id: { in: customerIds } },
    select: {
      id: true,
      name: true,
      phone: true,
      assignedStaff: { select: { displayName: true } },
      followUps: {
        where: { storeId },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, createdBy: { select: { name: true } } },
      },
    },
  });
  const trialDateByCustomer = new Map<string, Date>();
  for (const trial of trials) {
    const existing = trialDateByCustomer.get(trial.customerId);
    if (!existing || trial.bookingDate < existing) {
      trialDateByCustomer.set(trial.customerId, trial.bookingDate);
    }
  }

  return customers
    .flatMap((customer) => {
      const trialCompletedAt = trialDateByCustomer.get(customer.id);
      if (!trialCompletedAt) return [];
      const followUp = customer.followUps[0];
      return [{
        customerId: customer.id,
        customerName: customer.name ?? "(未命名)",
        customerPhone: customer.phone,
        trialCompletedAt,
        assignedStaffName: customer.assignedStaff?.displayName ?? null,
        lastFollowUp: followUp
          ? { createdAt: followUp.createdAt, createdByName: followUp.createdBy.name }
          : null,
      }];
    })
    .sort((a, b) => b.trialCompletedAt.getTime() - a.trialCompletedAt.getTime());
}
