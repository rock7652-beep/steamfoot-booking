import { prisma } from "@/lib/db";
import { bookingMonthRange } from "@/lib/date-utils";
import {
  hydrateCustomerSegment,
  type CustomerSegmentCustomer,
} from "@/server/queries/customer-segment-list";

export type CustomerFlowCounts = {
  uniqueVisitors: number;
  newVisitors: number;
  returningVisitors: number;
  trialCustomers: number;
};

export type CustomerFlowComparison = {
  difference: number;
  percentage: number | null;
};

export type CustomerFlowMetric = {
  current: number;
  mom: CustomerFlowComparison;
  yoy: CustomerFlowComparison;
};

export type CustomerFlowMetrics = {
  month: string;
  uniqueVisitors: CustomerFlowMetric;
  newVisitors: CustomerFlowMetric;
  returningVisitors: CustomerFlowMetric;
  trialCustomers: CustomerFlowMetric;
};

type CompletedBooking = {
  customerId: string;
  bookingDate: Date;
  bookingType: "FIRST_TRIAL" | "SINGLE" | "PACKAGE_SESSION";
};

function shiftMonth(month: string, offset: number): string {
  const [year, mon] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, mon - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function rangeForMonth(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return bookingMonthRange(year, mon);
}

export type CustomerFlowSelection = {
  uniqueVisitorIds: Set<string>;
  newVisitorIds: Set<string>;
  returningVisitorIds: Set<string>;
  trialCustomerIds: Set<string>;
};

export type CustomerFlowSegment = "monthly-customers" | "monthly-new" | "monthly-returning" | "monthly-trial";

export function selectCustomerFlowCustomerIds(
  month: string,
  bookings: CompletedBooking[],
  firstCompletedByCustomer: Map<string, Date>,
): CustomerFlowSelection {
  const { start, end } = rangeForMonth(month);
  const inMonth = bookings.filter(
    (booking) => booking.bookingDate >= start && booking.bookingDate <= end,
  );
  const visitors = new Set(inMonth.map((booking) => booking.customerId));
  const trialCustomers = new Set(
    inMonth
      .filter((booking) => booking.bookingType === "FIRST_TRIAL")
      .map((booking) => booking.customerId),
  );

  const newVisitorIds = new Set<string>();
  const returningVisitorIds = new Set<string>();
  for (const customerId of visitors) {
    const firstCompletedAt = firstCompletedByCustomer.get(customerId);
    if (firstCompletedAt && firstCompletedAt >= start && firstCompletedAt <= end) {
      newVisitorIds.add(customerId);
    } else if (firstCompletedAt && firstCompletedAt < start) {
      returningVisitorIds.add(customerId);
    }
  }

  return {
    uniqueVisitorIds: visitors,
    newVisitorIds,
    returningVisitorIds,
    trialCustomerIds: trialCustomers,
  };
}

function countsForMonth(
  month: string,
  bookings: CompletedBooking[],
  firstCompletedByCustomer: Map<string, Date>,
): CustomerFlowCounts {
  const selection = selectCustomerFlowCustomerIds(month, bookings, firstCompletedByCustomer);
  return {
    uniqueVisitors: selection.uniqueVisitorIds.size,
    newVisitors: selection.newVisitorIds.size,
    returningVisitors: selection.returningVisitorIds.size,
    trialCustomers: selection.trialCustomerIds.size,
  };
}

export function compareCustomerFlow(current: number, baseline: number): CustomerFlowComparison {
  return {
    difference: current - baseline,
    percentage: baseline === 0 ? null : ((current - baseline) / baseline) * 100,
  };
}

export function buildCustomerFlowMetrics(
  month: string,
  bookings: CompletedBooking[],
  firstCompletedByCustomer: Map<string, Date>,
): CustomerFlowMetrics {
  const previousMonth = shiftMonth(month, -1);
  const previousYearMonth = shiftMonth(month, -12);
  const current = countsForMonth(month, bookings, firstCompletedByCustomer);
  const previous = countsForMonth(previousMonth, bookings, firstCompletedByCustomer);
  const previousYear = countsForMonth(previousYearMonth, bookings, firstCompletedByCustomer);

  const metric = (key: keyof CustomerFlowCounts): CustomerFlowMetric => ({
    current: current[key],
    mom: compareCustomerFlow(current[key], previous[key]),
    yoy: compareCustomerFlow(current[key], previousYear[key]),
  });

  return {
    month,
    uniqueVisitors: metric("uniqueVisitors"),
    newVisitors: metric("newVisitors"),
    returningVisitors: metric("returningVisitors"),
    trialCustomers: metric("trialCustomers"),
  };
}

/**
 * 月度客流只計 COMPLETED Booking 的唯一 customerId。
 *
 * FIRST_TRIAL 多人同行限制：Booking 只有一個 customerId，因此體驗顧客數不使用
 * people / attendedPeople。同行者若未各自建立 Customer 與 Booking，本指標不納入。
 */
export async function getCustomerFlowMetrics(
  storeId: string,
  month: string,
): Promise<CustomerFlowMetrics> {
  const months = [month, shiftMonth(month, -1), shiftMonth(month, -12)];
  const ranges = months.map(rangeForMonth);
  const periodBookings = await prisma.booking.findMany({
    where: {
      storeId,
      bookingStatus: "COMPLETED",
      OR: ranges.map(({ start, end }) => ({ bookingDate: { gte: start, lte: end } })),
    },
    select: { customerId: true, bookingDate: true, bookingType: true },
  });

  const customerIds = [...new Set(periodBookings.map((booking) => booking.customerId))];
  const firstCompleted = customerIds.length
    ? await prisma.booking.groupBy({
        by: ["customerId"],
        where: {
          storeId,
          customerId: { in: customerIds },
          bookingStatus: "COMPLETED",
        },
        _min: { bookingDate: true },
      })
    : [];
  const firstCompletedByCustomer = new Map(
    firstCompleted.flatMap((row) =>
      row._min.bookingDate ? [[row.customerId, row._min.bookingDate] as const] : [],
    ),
  );

  return buildCustomerFlowMetrics(month, periodBookings, firstCompletedByCustomer);
}

export async function getCustomerFlowCustomers(
  storeId: string,
  month: string,
  segment: CustomerFlowSegment,
): Promise<CustomerSegmentCustomer[]> {
  const { start, end } = rangeForMonth(month);
  const bookings = await prisma.booking.findMany({
    where: { storeId, bookingStatus: "COMPLETED", bookingDate: { gte: start, lte: end } },
    select: { customerId: true, bookingDate: true, bookingType: true },
  });
  const customerIds = [...new Set(bookings.map((booking) => booking.customerId))];
  const firstCompleted = customerIds.length
    ? await prisma.booking.groupBy({
        by: ["customerId"],
        where: { storeId, customerId: { in: customerIds }, bookingStatus: "COMPLETED" },
        _min: { bookingDate: true },
      })
    : [];
  const firstCompletedByCustomer = new Map(
    firstCompleted.flatMap((row) =>
      row._min.bookingDate ? [[row.customerId, row._min.bookingDate] as const] : [],
    ),
  );
  const selection = selectCustomerFlowCustomerIds(month, bookings, firstCompletedByCustomer);
  const idsBySegment: Record<CustomerFlowSegment, Set<string>> = {
    "monthly-customers": selection.uniqueVisitorIds,
    "monthly-new": selection.newVisitorIds,
    "monthly-returning": selection.returningVisitorIds,
    "monthly-trial": selection.trialCustomerIds,
  };
  return hydrateCustomerSegment(storeId, idsBySegment[segment]);
}
