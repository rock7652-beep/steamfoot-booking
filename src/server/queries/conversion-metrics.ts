import { prisma } from "@/lib/db";
import { loadIndividualBookingFacts, replaceGroupedBookingFacts } from "./booking-participant-facts";
import { bookingMonthRange, toLocalDateStr } from "@/lib/date-utils";
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
  currentTrialConversions: ConversionMetric;
  trackedConversions: ConversionMetric;
  convertedCustomers: ConversionMetric;
  conversionRate: ConversionMetric;
  unconvertedCustomers: ConversionMetric;
};

export type CompletedTrial = {
  id?: string;
  bookingId?: string;
  customerId: string;
  bookingDate: Date;
  people?: number;
  attendedPeople?: number | null;
};

export type PackagePurchase = {
  customerId: string;
  transactionDate: Date;
  paidAt?: Date | null;
  customerPlanWallet: { status: string } | null;
  netAmount?: number;
};

type ConversionCounts = {
  trialAttendees: number;
  currentTrialConversions: number;
  trackedConversions: number;
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

function purchaseOccurredAt(purchase: PackagePurchase): Date {
  return purchase.paidAt ?? purchase.transactionDate;
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
  const currentTrialConversions = selection.currentTrialConvertedCustomerIds.size;
  const trackedConversions = selection.trackedConvertedCustomerIds.size;
  const convertedCustomers = selection.convertedCustomerIds.size;
  return {
    trialAttendees,
    currentTrialConversions,
    trackedConversions,
    convertedCustomers,
    conversionRate: selection.trialCustomerIds.size === 0 ? 0 : (currentTrialConversions / selection.trialCustomerIds.size) * 100,
    unconvertedCustomers: selection.unconvertedCustomerIds.size,
  };
}

export type ConversionCustomerSelection = {
  trialCustomerIds: Set<string>;
  currentTrialConvertedCustomerIds: Set<string>;
  trackedConvertedCustomerIds: Set<string>;
  convertedCustomerIds: Set<string>;
  unconvertedCustomerIds: Set<string>;
};

/**
 * 體驗轉換率按同一人的首次體驗月份歸屬，後續購買回到原體驗 cohort。
 * 本月實際開卡／追蹤開卡仍按付款月份列出，不改變實際營收日期。
 */
export function selectConversionCustomerIds(
  month: string,
  trials: CompletedTrial[],
  purchases: PackagePurchase[],
  range?: { startDate: string; endDate: string },
): ConversionCustomerSelection {
  const firstTrialDateByCustomer = new Map<string, string>();
  for (const trial of trials) {
    const trialDate = toLocalDateStr(trial.bookingDate);
    const existing = firstTrialDateByCustomer.get(trial.customerId);
    if (!existing || trialDate < existing) firstTrialDateByCustomer.set(trial.customerId, trialDate);
  }

  const firstPurchaseByCustomer = new Map<string, PackagePurchase>();
  for (const purchase of purchases) {
    if (!purchase.customerPlanWallet || purchase.customerPlanWallet.status === "CANCELLED") continue;
    if (purchase.netAmount != null && purchase.netAmount <= 0) continue;
    const trialDate = firstTrialDateByCustomer.get(purchase.customerId);
    const occurredAt = purchaseOccurredAt(purchase);
    if (!trialDate) continue;
    const existing = firstPurchaseByCustomer.get(purchase.customerId);
    if (!existing || occurredAt < purchaseOccurredAt(existing)) {
      firstPurchaseByCustomer.set(purchase.customerId, purchase);
    }
  }
  // A customer who already had a paid package is not a new trial conversion.
  for (const [customerId, purchase] of firstPurchaseByCustomer) {
    if (toLocalDateStr(purchaseOccurredAt(purchase)) < firstTrialDateByCustomer.get(customerId)!) {
      firstTrialDateByCustomer.delete(customerId); firstPurchaseByCustomer.delete(customerId);
    }
  }

  const currentTrialConvertedCustomerIds = new Set<string>();
  const trackedConvertedCustomerIds = new Set<string>();
  const convertedCustomerIds = new Set<string>();
  for (const [customerId, purchase] of firstPurchaseByCustomer) {
    const purchaseDate = toLocalDateStr(purchaseOccurredAt(purchase));
    const purchaseMonth = purchaseDate.slice(0, 7);
    const trialDate = firstTrialDateByCustomer.get(customerId)!;
    const trialMonth = trialDate.slice(0, 7);
    if (range ? trialDate >= range.startDate && trialDate <= range.endDate : trialMonth === month) currentTrialConvertedCustomerIds.add(customerId);
    if (range ? purchaseDate < range.startDate || purchaseDate > range.endDate : purchaseMonth !== month) continue;
    if (range ? trialDate < range.startDate : trialMonth < month) trackedConvertedCustomerIds.add(customerId);
    convertedCustomerIds.add(customerId);
  }

  const trialCustomerIds = new Set(
    [...firstTrialDateByCustomer]
      .filter(([, trialDate]) => range ? trialDate >= range.startDate && trialDate <= range.endDate : trialDate.startsWith(`${month}-`))
      .map(([customerId]) => customerId),
  );
  const unconvertedCustomerIds = new Set(
    [...trialCustomerIds].filter((customerId) => !currentTrialConvertedCustomerIds.has(customerId)),
  );
  return {
    trialCustomerIds,
    currentTrialConvertedCustomerIds,
    trackedConvertedCustomerIds,
    convertedCustomerIds,
    unconvertedCustomerIds,
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
    trialAttendees: metric("trialAttendees"),
    currentTrialConversions: metric("currentTrialConversions"),
    trackedConversions: metric("trackedConversions"),
    convertedCustomers: metric("convertedCustomers"),
    conversionRate: metric("conversionRate"),
    unconvertedCustomers: metric("unconvertedCustomers"),
  };
}

/**
 * 體驗人次保留實際完成服務數；開卡率母數為可辨識的首次體驗顧客。
 * 同店本人後續有效已收正式方案計回首次體驗月份；實際開卡數仍按付款月份。
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

export async function loadConversionFacts(storeId: string, months: string[]): Promise<{ trials: CompletedTrial[]; purchases: PackagePurchase[] }> {
  const bookingRanges = months.map(bookingRangeForMonth);
  const latestBookingEnd = bookingRanges.reduce(
    (latest, range) => range.end > latest ? range.end : latest,
    bookingRanges[0].end,
  );
  const groupedTrials = await prisma.booking.findMany({
    where: {
      storeId,
      bookingStatus: "COMPLETED",
      bookingType: "FIRST_TRIAL",
      bookingDate: { lte: latestBookingEnd },
    },
    select: {
      id: true,
      customerId: true,
      bookingDate: true,
      people: true,
      attendedPeople: true,
    },
  });
  const individual = await loadIndividualBookingFacts(storeId, latestBookingEnd);
  const trials = [...replaceGroupedBookingFacts(groupedTrials, individual.groupIds), ...individual.visits.filter(visit => visit.bookingType === "FIRST_TRIAL")];

  const customerIds = [...new Set(trials.map((trial) => trial.customerId))];
  // As-of now, not the cohort month's end: later paid purchases update conversion.
  const latestTransactionEnd = new Date();
  const purchases = customerIds.length
    ? await prisma.transaction.findMany({
        where: {
          storeId,
          customerId: { in: customerIds },
          transactionType: "PACKAGE_PURCHASE",
          status: "SUCCESS",
          paymentStatus: { in: ["SUCCESS", "CONFIRMED"] },
          customerPlanWalletId: { not: null },
          OR: [{ paidAt: { lte: latestTransactionEnd } }, { paidAt: null, transactionDate: { lte: latestTransactionEnd } }],
        },
        select: {
          customerId: true,
          transactionDate: true,
          paidAt: true,
          customerPlanWallet: { select: { status: true } },
          amount: true,
          refunds: { where: { status: "SUCCESS", paymentStatus: { in: ["SUCCESS", "CONFIRMED"] } }, select: { amount: true } },
        },
      })
    : [];

  return { trials, purchases: purchases.map(purchase => ({ ...purchase,
    netAmount: Number(purchase.amount) + purchase.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0),
  })) };
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
  const customerIds = [...selection.trialCustomerIds];
  if (customerIds.length === 0) return [];

  const customers = await prisma.customer.findMany({
    where: { storeId, id: { in: [...selection.unconvertedCustomerIds] } },
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

export type ConversionCustomerSegment =
  | "monthly-converted"
  | "monthly-current-trial-converted"
  | "monthly-tracked-converted"
  | "monthly-unconverted";

export async function getConversionCustomers(
  storeId: string,
  month: string,
  segment: ConversionCustomerSegment,
): Promise<CustomerSegmentCustomer[]> {
  if (segment === "monthly-unconverted") {
    const customers = await getMonthlyUnconvertedCustomers(storeId, month);
    return hydrateCustomerSegment(storeId, new Set(customers.map((customer) => customer.customerId)));
  }
  const { trials, purchases } = await loadConversionFacts(storeId, [month]);
  const selection = selectConversionCustomerIds(month, trials, purchases);
  const ids = segment === "monthly-converted"
    ? selection.convertedCustomerIds
    : segment === "monthly-current-trial-converted"
      ? selection.currentTrialConvertedCustomerIds
      : segment === "monthly-tracked-converted"
        ? selection.trackedConvertedCustomerIds
        : new Set<string>();
  return hydrateCustomerSegment(storeId, ids);
}
