import { prisma } from "@/lib/db";
import { bookingMonthRange, monthRange, toLocalDateStr } from "@/lib/date-utils";
import { REVENUE_NET_TYPES, REVENUE_VALID_STATUS } from "@/lib/booking-constants";
import { selectConversionCustomerIds } from "@/server/queries/conversion-metrics";

export type StorePerformanceTrend = {
  month: string;
  label: string;
  trialAttendees: number;
  convertedCustomers: number;
  conversionRate: number;
  completedServices: number;
  revenue: number;
  retailRevenue: number;
};

function shiftMonth(month: string, offset: number): string {
  const [year, mon] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, mon - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function bookingRange(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return bookingMonthRange(year, mon);
}

function monthLabel(month: string): string {
  const [, mon] = month.split("-");
  return `${Number(mon)}月`;
}

function attendance(row: { people: number; attendedPeople: number | null }): number {
  return row.attendedPeople ?? row.people;
}

/** 六個月經營趨勢。營收 = 系統交易淨額 + 手動收入；零售 = 手動收入 category 以「零售-」開頭。 */
export async function getStorePerformanceTrends(
  storeId: string,
  endingMonth: string,
): Promise<StorePerformanceTrend[]> {
  const months = Array.from({ length: 6 }, (_, index) => shiftMonth(endingMonth, index - 5));
  const firstBookingRange = bookingRange(months[0]);
  const lastBookingRange = bookingRange(months[5]);
  const firstTxRange = monthRange(months[0]);
  const lastTxRange = monthRange(months[5]);

  const [bookings, transactions, cashbookEntries, conversionTrials, packagePurchases] = await Promise.all([
    prisma.booking.findMany({
      where: {
        storeId,
        bookingStatus: "COMPLETED",
        bookingDate: { gte: firstBookingRange.start, lte: lastBookingRange.end },
      },
      select: {
        customerId: true,
        bookingDate: true,
        bookingType: true,
        people: true,
        attendedPeople: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        storeId,
        transactionType: { in: REVENUE_NET_TYPES as never },
        status: REVENUE_VALID_STATUS,
        paymentStatus: { in: ["SUCCESS", "CONFIRMED"] },
        transactionDate: { gte: firstTxRange.start, lte: lastTxRange.end },
      },
      select: {
        customerId: true,
        transactionDate: true,
        transactionType: true,
        amount: true,
        customerPlanWalletId: true,
        customerPlanWallet: { select: { status: true } },
      },
    }),
    prisma.cashbookEntry.findMany({
      where: {
        storeId,
        type: "INCOME",
        entryDate: { gte: firstBookingRange.start, lte: lastBookingRange.end },
      },
      select: { entryDate: true, category: true, amount: true },
    }),
    prisma.booking.findMany({
      where: {
        storeId,
        bookingStatus: "COMPLETED",
        bookingType: "FIRST_TRIAL",
        bookingDate: { lte: lastBookingRange.end },
      },
      select: {
        customerId: true,
        bookingDate: true,
        people: true,
        attendedPeople: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        storeId,
        transactionType: "PACKAGE_PURCHASE",
        status: "SUCCESS",
        paymentStatus: { in: ["SUCCESS", "CONFIRMED"] },
        customerPlanWalletId: { not: null },
        transactionDate: { lte: lastTxRange.end },
      },
      select: {
        customerId: true,
        transactionDate: true,
        paidAt: true,
        customerPlanWallet: { select: { status: true } },
      },
    }),
  ]);

  return months.map((month) => {
    const trialRows = bookings.filter(
      (b) => b.bookingType === "FIRST_TRIAL" && toLocalDateStr(b.bookingDate).startsWith(`${month}-`),
    );
    const monthBookings = bookings.filter((b) => toLocalDateStr(b.bookingDate).startsWith(`${month}-`));
    const trialAttendees = trialRows.reduce((sum, row) => sum + attendance(row), 0);
    const completedServices = monthBookings.reduce((sum, row) => sum + attendance(row), 0);

    const conversion = selectConversionCustomerIds(month, conversionTrials, packagePurchases);

    const systemRevenue = transactions
      .filter((tx) => toLocalDateStr(tx.transactionDate).startsWith(`${month}-`))
      .reduce((sum, tx) => sum + Number(tx.amount), 0);
    const monthCashbook = cashbookEntries.filter((entry) =>
      toLocalDateStr(entry.entryDate).startsWith(`${month}-`),
    );
    const manualIncome = monthCashbook.reduce((sum, entry) => sum + Number(entry.amount), 0);
    const retailRevenue = monthCashbook
      .filter((entry) => entry.category?.startsWith("零售-"))
      .reduce((sum, entry) => sum + Number(entry.amount), 0);

    return {
      month,
      label: monthLabel(month),
      trialAttendees,
      convertedCustomers: conversion.convertedCustomerIds.size,
      conversionRate: trialAttendees === 0
        ? 0
        : (conversion.currentTrialConvertedCustomerIds.size / trialAttendees) * 100,
      completedServices,
      revenue: systemRevenue + manualIncome,
      retailRevenue,
    };
  });
}
