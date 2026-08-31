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
  trialAttendees: number;
  trialBookingGroups: number;
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
  trialAttendees: CustomerFlowMetric;
  trialBookingGroups: CustomerFlowMetric;
};

type CompletedBooking = {
  customerId: string;
  bookingDate: Date;
  bookingType: "FIRST_TRIAL" | "SINGLE" | "PACKAGE_SESSION";
  people?: number;
  attendedPeople?: number | null;
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

function actualAttendance(booking: CompletedBooking): number {
  return booking.attendedPeople ?? booking.people ?? 1;
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
  const { start, end } = rangeForMonth(month);
  const inMonth = bookings.filter(
    (booking) => booking.bookingDate >= start && booking.bookingDate <= end,
  );
  const trialBookings = inMonth.filter((booking) => booking.bookingType === "FIRST_TRIAL");
  const selection = selectCustomerFlowCustomerIds(month, bookings, firstCompletedByCustomer);
  return {
    uniqueVisitors: selection.uniqueVisitorIds.size,
    newVisitors: selection.newVisitorIds.size,
    returningVisitors: selection.returningVisitorIds.size,
    trialCustomers: selection.trialCustomerIds.size,
    trialAttendees: trialBookings.reduce((sum, booking) => sum + actualAttendance(booking), 0),
    trialBookingGroups: trialBookings.length,
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
    trialAttendees: metric("trialAttendees"),
    trialBookingGroups: metric("trialBookingGroups"),
  };
}

/**
 * 唯一顧客 KPI 仍以 customerId 去重；體驗另外提供「實際到店人次」與「預約組數」。
 * FIRST_TRIAL 多人同行若沒有各自建 Customer，會計入 trialAttendees，但不會虛構成可點擊的顧客身份。
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
    select: {
      customerId: true,
      bookingDate: true,
      bookingType: true,
      people: true,
      attendedPeople: true,
    },
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
    select: { customerId: true, bookingDate: true, bookingType: true, people: true, attendedPeople: true },
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
