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

type CompletedTrial = {
  customerId: string;
  bookingDate: Date;
};

type PackagePurchase = {
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
  const trialDatesByCustomer = new Map<string, Set<string>>();
  for (const trial of trials) {
    // bookingDate 是 DB 的純日期欄位，UTC midnight 可安全取日期部分。
    const trialDate = trial.bookingDate.toISOString().slice(0, 10);
    if (!trialDate.startsWith(`${month}-`)) continue;
    const dates = trialDatesByCustomer.get(trial.customerId) ?? new Set<string>();
    dates.add(trialDate);
    trialDatesByCustomer.set(trial.customerId, dates);
  }

  const converted = new Set<string>();
  for (const purchase of purchases) {
    const trialDates = trialDatesByCustomer.get(purchase.customerId);
    if (!trialDates) continue;

    // Wallet CANCELLED 是全額退款／作廢後權益完全取消的正式依據。
    // 正常用完或到期的方案仍是歷史上成立的開卡，不應讓過去 KPI 隨時間消失。
    if (!purchase.customerPlanWallet || purchase.customerPlanWallet.status === "CANCELLED") continue;
    if (trialDates.has(toLocalDateStr(purchase.transactionDate))) {
      converted.add(purchase.customerId);
    }
  }

  const trialCustomers = trialDatesByCustomer.size;
  const convertedCustomers = converted.size;
  return {
    convertedCustomers,
    conversionRate: trialCustomers === 0 ? 0 : (convertedCustomers / trialCustomers) * 100,
    unconvertedCustomers: trialCustomers - convertedCustomers,
  };
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

  return buildConversionMetrics(month, trials, purchases);
}
