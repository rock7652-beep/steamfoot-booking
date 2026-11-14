import { prisma } from "@/lib/db";
import { loadIndividualBookingFacts, replaceGroupedBookingFacts } from "./booking-participant-facts";
import { addTaiwanDuration, bookingMonthRange, toLocalDateStr } from "@/lib/date-utils";
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
  trialCustomers: ConversionMetric;
  currentTrialConversions: ConversionMetric;
  trackedConversions: ConversionMetric;
  convertedCustomers: ConversionMetric;
  renewedCustomers: ConversionMetric;
  observingTrialCustomers: ConversionMetric;
  conversionRate: ConversionMetric;
  unconvertedCustomers: ConversionMetric;
};

export type CompletedTrial = {
  id?: string;
  bookingId?: string;
  customerId: string | null;
  bookingDate: Date;
  slotTime?: string;
  people?: number;
  attendedPeople?: number | null;
};

export type PackagePurchase = {
  id?: string;
  customerId: string;
  transactionDate: Date;
  paidAt?: Date | null;
  customerPlanWallet: { id?: string; status: string } | null;
  netAmount?: number;
};

type ConversionCounts = {
  trialAttendees: number;
  trialCustomers: number;
  currentTrialConversions: number;
  trackedConversions: number;
  convertedCustomers: number;
  renewedCustomers: number;
  observingTrialCustomers: number;
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
    trialCustomers: selection.trialCustomerIds.size,
    currentTrialConversions,
    trackedConversions,
    convertedCustomers,
    renewedCustomers: selectRenewalCustomerIds(month, purchases).size,
    observingTrialCustomers: selection.observingTrialCustomerIds.size,
    conversionRate: selection.trialCustomerIds.size === 0 ? 0 : (selection.cohortConvertedCustomerIds.size / selection.trialCustomerIds.size) * 100,
    unconvertedCustomers: selection.unconvertedCustomerIds.size,
  };
}

export type ConversionCustomerSelection = {
  trialCustomerIds: Set<string>;
  currentTrialConvertedCustomerIds: Set<string>;
  trackedConvertedCustomerIds: Set<string>;
  convertedCustomerIds: Set<string>;
  unconvertedCustomerIds: Set<string>;
  cohortConvertedCustomerIds: Set<string>;
  observingTrialCustomerIds: Set<string>;
};

/** Paid plan rights only; a split/repeated transaction for one wallet is one purchase. */
function validPackagePurchases(purchases: PackagePurchase[]) {
  const seen = new Set<string>();
  return purchases.filter(p => p.customerPlanWallet && p.customerPlanWallet.status !== "CANCELLED" && (p.netAmount == null || p.netAmount > 0))
    .sort((a, b) => +purchaseOccurredAt(a) - +purchaseOccurredAt(b) || (a.id ?? "").localeCompare(b.id ?? ""))
    .filter(p => {
      const key = JSON.stringify([p.customerId, p.customerPlanWallet?.id ?? p.id ?? +purchaseOccurredAt(p)]);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
}

/** Renewal people follow the payment period, including customers without a trial record. */
export function selectRenewalCustomerIds(month: string, purchases: PackagePurchase[], range?: { startDate: string; endDate: string }) {
  const first = new Set<string>(), renewed = new Set<string>(), now = new Date();
  for (const purchase of validPackagePurchases(purchases)) {
    if (purchaseOccurredAt(purchase) > now) continue;
    const date = toLocalDateStr(purchaseOccurredAt(purchase));
    const within = range ? date >= range.startDate && date <= range.endDate : date.startsWith(`${month}-`);
    if (first.has(purchase.customerId) && within) renewed.add(purchase.customerId);
    first.add(purchase.customerId);
  }
  return renewed;
}

/** Period trial people and their 30-day first openings share one cohort, including later-month openings. */
export function selectConversionCustomerIds(
  month: string,
  trials: CompletedTrial[],
  purchases: PackagePurchase[],
  range?: { startDate: string; endDate: string },
  now = new Date(),
): ConversionCustomerSelection {
  const within = (date: string) => range ? date >= range.startDate && date <= range.endDate : date.startsWith(`${month}-`);
  const firstTrialDateByCustomer = new Map<string, string>();
  for (const trial of trials) {
    if (!trial.customerId) continue;
    const date = toLocalDateStr(trial.bookingDate), previous = firstTrialDateByCustomer.get(trial.customerId);
    if (!previous || date < previous) firstTrialDateByCustomer.set(trial.customerId, date);
  }
  const firstPurchaseByCustomer = new Map<string, PackagePurchase>();
  for (const purchase of validPackagePurchases(purchases)) {
    if (purchaseOccurredAt(purchase) <= now && !firstPurchaseByCustomer.has(purchase.customerId)) firstPurchaseByCustomer.set(purchase.customerId, purchase);
  }
  for (const [id, purchase] of firstPurchaseByCustomer) {
    const trialDate = firstTrialDateByCustomer.get(id);
    if (trialDate && toLocalDateStr(purchaseOccurredAt(purchase)) < trialDate) firstTrialDateByCustomer.delete(id);
  }
  const trialCustomerIds = new Set([...firstTrialDateByCustomer].filter(([, date]) => within(date)).map(([id]) => id));
  const cohortConvertedCustomerIds = new Set<string>(), currentTrialConvertedCustomerIds = new Set<string>();
  const trackedConvertedCustomerIds = new Set<string>(), convertedCustomerIds = new Set<string>();
  for (const [id, purchase] of firstPurchaseByCustomer) {
    const purchaseDate = toLocalDateStr(purchaseOccurredAt(purchase));
    const trialDate = firstTrialDateByCustomer.get(id);
    if (!trialDate) continue;
    if (purchaseDate < trialDate || purchaseDate > addTaiwanDuration(trialDate, 30, "DAY")) continue;
    if (trialCustomerIds.has(id)) {
      cohortConvertedCustomerIds.add(id);
      convertedCustomerIds.add(id);
    }
    if (!within(purchaseDate)) continue;
    if (trialCustomerIds.has(id)) currentTrialConvertedCustomerIds.add(id);
    else trackedConvertedCustomerIds.add(id);
  }
  // Follow-up stays about actual non-buyers; a day-31 buyer is not mislabeled as unpaid.
  const unconvertedCustomerIds = new Set([...trialCustomerIds].filter(id => !firstPurchaseByCustomer.has(id)));
  const today = toLocalDateStr(now);
  const observingTrialCustomerIds = new Set([...unconvertedCustomerIds].filter(id => today <= addTaiwanDuration(firstTrialDateByCustomer.get(id)!, 30, "DAY")));
  return { trialCustomerIds, cohortConvertedCustomerIds, currentTrialConvertedCustomerIds, trackedConvertedCustomerIds,
    convertedCustomerIds, unconvertedCustomerIds, observingTrialCustomerIds };
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
    trialCustomers: metric("trialCustomers"),
    currentTrialConversions: metric("currentTrialConversions"),
    trackedConversions: metric("trackedConversions"),
    convertedCustomers: metric("convertedCustomers"),
    renewedCustomers: metric("renewedCustomers"),
    observingTrialCustomers: metric("observingTrialCustomers"),
    conversionRate: metric("conversionRate"),
    unconvertedCustomers: metric("unconvertedCustomers"),
  };
}

/**
 * 體驗人次保留實際完成服務數；開卡率母數為可辨識的首次體驗顧客。
 * 所選期間首次體驗後 30 天內的首次有效購課，跨月仍回計該期間開卡人數與轉化率；續購按付款期間。
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
      slotTime: true,
      people: true,
      attendedPeople: true,
    },
  });
  const individual = await loadIndividualBookingFacts(storeId, latestBookingEnd);
  const trials = [...replaceGroupedBookingFacts(groupedTrials, individual.groupIds), ...[...individual.visits, ...(individual.unregisteredVisits ?? [])].filter(visit => visit.bookingType === "FIRST_TRIAL")];

  // As-of now, not the cohort month's end: later paid purchases update conversion.
  const latestTransactionEnd = new Date();
  const purchases = await prisma.transaction.findMany({
        where: {
          storeId,
          customerId: { not: null },
          transactionType: "PACKAGE_PURCHASE",
          status: "SUCCESS",
          paymentStatus: { in: ["SUCCESS", "CONFIRMED"] },
          customerPlanWalletId: { not: null },
          OR: [{ paidAt: { lte: latestTransactionEnd } }, { paidAt: null, transactionDate: { lte: latestTransactionEnd } }],
        },
        select: {
          id: true,
          customerId: true,
          transactionDate: true,
          paidAt: true,
          customerPlanWallet: { select: { id: true, status: true } },
          amount: true,
          refunds: { where: { status: "SUCCESS", paymentStatus: { in: ["SUCCESS", "CONFIRMED"] } }, select: { amount: true } },
        },
      });

  return { trials, purchases: purchases.filter((purchase): purchase is typeof purchase & { customerId: string } => !!purchase.customerId).map(purchase => ({ ...purchase,
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
    if (!trial.customerId) continue;
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
  | "monthly-conversion-trial"
  | "monthly-renewed"
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
  const ids = segment === "monthly-conversion-trial"
    ? selection.trialCustomerIds
    : segment === "monthly-renewed"
    ? selectRenewalCustomerIds(month, purchases)
    : segment === "monthly-converted"
    ? selection.convertedCustomerIds
    : segment === "monthly-current-trial-converted"
      ? selection.currentTrialConvertedCustomerIds
      : segment === "monthly-tracked-converted"
        ? selection.trackedConvertedCustomerIds
        : new Set<string>();
  return hydrateCustomerSegment(storeId, ids);
}
