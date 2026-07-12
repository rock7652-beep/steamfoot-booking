import { prisma } from "@/lib/db";
import { bookingMonthRange } from "@/lib/date-utils";

export type RetentionComparison = {
  difference: number;
  percentage: number | null;
};

export type RetentionMetric = {
  current: number;
  mom: RetentionComparison;
  yoy: RetentionComparison;
};

export type RetentionMetrics = {
  month: string;
  returnedCustomers: RetentionMetric;
  retentionRate: RetentionMetric;
  unreturnedCustomers: RetentionMetric;
};

type CompletedBooking = {
  customerId: string;
  bookingDate: Date;
};

type RetentionCounts = {
  returnedCustomers: number;
  retentionRate: number;
  unreturnedCustomers: number;
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

function customersInMonth(month: string, bookings: CompletedBooking[]): Set<string> {
  const { start, end } = rangeForMonth(month);
  return new Set(
    bookings
      .filter((booking) => booking.bookingDate >= start && booking.bookingDate <= end)
      .map((booking) => booking.customerId),
  );
}

function countsForMonth(month: string, bookings: CompletedBooking[]): RetentionCounts {
  const cohort = customersInMonth(shiftMonth(month, -1), bookings);
  const currentCustomers = customersInMonth(month, bookings);
  const returnedCustomers = [...cohort].filter((customerId) =>
    currentCustomers.has(customerId),
  ).length;

  return {
    returnedCustomers,
    retentionRate: cohort.size === 0 ? 0 : (returnedCustomers / cohort.size) * 100,
    unreturnedCustomers: cohort.size - returnedCustomers,
  };
}

function compare(current: number, baseline: number): RetentionComparison {
  return {
    difference: current - baseline,
    percentage: baseline === 0 ? null : ((current - baseline) / baseline) * 100,
  };
}

export function buildRetentionMetrics(
  month: string,
  bookings: CompletedBooking[],
): RetentionMetrics {
  const current = countsForMonth(month, bookings);
  const previous = countsForMonth(shiftMonth(month, -1), bookings);
  const previousYear = countsForMonth(shiftMonth(month, -12), bookings);

  const metric = (key: keyof RetentionCounts): RetentionMetric => ({
    current: current[key],
    mom: compare(current[key], previous[key]),
    yoy: compare(current[key], previousYear[key]),
  });

  return {
    month,
    returnedCustomers: metric("returnedCustomers"),
    retentionRate: metric("retentionRate"),
    unreturnedCustomers: metric("unreturnedCustomers"),
  };
}

/**
 * 候選 B：目標月份的前一月 COMPLETED Booking 唯一 customerId 為 cohort，
 * 再計算其中於目標月份再次完成服務的顧客。只在指定 storeId 內判斷。
 * Booking 只有一個 customerId，因此不使用 people / attendedPeople。
 */
export async function getRetentionMetrics(
  storeId: string,
  month: string,
): Promise<RetentionMetrics> {
  const months = [
    month,
    shiftMonth(month, -1),
    shiftMonth(month, -2),
    shiftMonth(month, -12),
    shiftMonth(month, -13),
  ];
  const ranges = months.map(rangeForMonth);
  const bookings = await prisma.booking.findMany({
    where: {
      storeId,
      bookingStatus: "COMPLETED",
      OR: ranges.map(({ start, end }) => ({ bookingDate: { gte: start, lte: end } })),
    },
    select: { customerId: true, bookingDate: true },
  });

  return buildRetentionMetrics(month, bookings);
}
