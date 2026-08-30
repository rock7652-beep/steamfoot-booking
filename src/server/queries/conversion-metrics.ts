import { prisma } from "@/lib/db";
import { bookingMonthRange, monthRange, toLocalDateStr } from "@/lib/date-utils";
import {
  hydrateCustomerSegment,
  type CustomerSegmentCustomer,
} from "@/server/queries/customer-segment-list";

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
  trialAttendees: ConversionMetric;
  convertedCustomers: ConversionMetric;
  conversionRate: ConversionMetric;
  unconvertedCustomers: ConversionMetric;
};

export type CompletedTrial = {
  customerId: string;
  bookingDate: Date;
  people?: number;
  attendedPeople?: number | null;
};

export type PackagePurchase = {
  customerId: string;
  transactionDate: Date;
  customerPlanWallet: { status: string } | null;
};

type ConversionCounts = {
  trialAttendees: number;
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

function actualAttendance(trial: CompletedTrial): number {
  return trial.attendedPeople ?? trial.people ?? 1;
}

function countsForMonth(
  month: string,
  trials: CompletedTrial[],
  purchases: PackagePurchase[],
): ConversionCounts {
  const selection = selectConversionCustomerIds(month, trials, purchases);
  const trialAttendees = trials
    .filter((trial) => toLocalDateStr(trial.bookingDate).startsWith(`${month}-`))
    .reduce((sum, trial) => sum + actualAttendance(trial), 0);
  const convertedCustomers = selection.convertedCustomerIds.size;
  return {
    trialAttendees,
    convertedCustomers,
    conversionRate: trialAttendees === 0 ? 0 : (convertedCustomers / trialAttendees) * 100,
    unconvertedCustomers: Math.max(trialAttendees - convertedCustomers, 0),
  };
}

export type ConversionCustomerSelection = {
  trialCustomerIds: Set<string>;
  convertedCustomerIds: Set<string>;
  unconvertedCustomerIds: Set<string>;
};

/** KPI 的主聯絡人 CRM list 共用 customerId selection；同行者若未建檔，只能納入人次 KPI。 */
export function selectConversionCustomerIds(
  month: string,
  trials: CompletedTrial[],
  purchases: PackagePurchase[],
): ConversionCustomerSelection {
  const trialDatesByCustomer = new Map<string, Set<string>>();
  for (const trial of trials) {
    const trialDate = toLocalDateStr(trial.bookingDate);
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
    trialAttendees: metric("trialAttendees"),
    convertedCustomers: metric("convertedCustomers"),
    conversionRate: metric("conversionRate"),
    unconvertedCustomers: metric("unconvertedCustomers"),
  };
}

/**
 * 體驗母數 = FIRST_TRIAL 完成時的實際到店人數（attendedPeople ?? people）。
 * 開卡分子 = 同店、同一台灣日完成 FIRST_TRIAL 並成功購買正式方案、且 Wallet 未取消的顧客。
 *
 * 同行者若沒有各自建立 Customer，系統只能把他計入「體驗人次」母數，無法在 CRM 名單
 * 顯示其個人身份；這是資料模型的既有限制，但不再把 2～4 人同行錯算成 1 次體驗。
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
    select: {
      customerId: true,
      bookingDate: true,
      people: true,
      attendedPeople: true,
    },
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

export type ConversionCustomerSegment = "monthly-converted" | "monthly-unconverted";

export async function getConversionCustomers(
  storeId: string,
  month: string,
  segment: ConversionCustomerSegment,
): Promise<CustomerSegmentCustomer[]> {
  const { trials, purchases } = await loadConversionFacts(storeId, [month]);
  const selection = selectConversionCustomerIds(month, trials, purchases);
  const ids = segment === "monthly-converted"
    ? selection.convertedCustomerIds
    : selection.unconvertedCustomerIds;
  return hydrateCustomerSegment(storeId, ids);
}
