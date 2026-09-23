import { prisma } from "@/lib/db";
import { dayRange } from "@/lib/date-utils";
import {
  TRIAL_BOOKING_SOURCES,
  TRIAL_BOOKING_SOURCE_LABELS,
  type TrialBookingSource,
} from "@/lib/trial-booking-source";

export type TrialSourceRow = {
  source: TrialBookingSource;
  label: string;
  bookings: number;
  sourceShare: number;
  bookedPeople: number;
  attendees: number;
  attendanceRate: number;
  assignedCustomers: number;
  planRate: number;
};

/**
 * Cohort by booking creation date in Asia/Taipei. Attendance and assigned plan
 * conversion update as the cohort progresses; cancelled bookings stay in the
 * booking count, and cannot contribute attendance or conversion.
 */
export async function getTrialSourceMetrics(
  storeId: string,
  startDate: string,
  endDate: string,
): Promise<TrialSourceRow[]> {
  const { start } = dayRange(startDate);
  const { end } = dayRange(endDate);
  const bookings = await prisma.booking.findMany({
    where: {
      storeId,
      bookingType: "FIRST_TRIAL",
      createdAt: { gte: start, lte: end },
    },
    select: {
      id: true,
      customerId: true,
      bookingSource: true,
      bookingDate: true,
      createdAt: true,
      bookingStatus: true,
      attendedPeople: true,
      people: true,
    },
  });

  const completed = bookings.filter((booking) => booking.bookingStatus === "COMPLETED");
  const customerIds = [...new Set(completed.map((booking) => booking.customerId))];
  const wallets = customerIds.length
    ? await prisma.customerPlanWallet.findMany({
        where: {
          storeId,
          customerId: { in: customerIds },
          status: { not: "CANCELLED" },
          plan: { category: "PACKAGE" },
        },
        select: { customerId: true, createdAt: true },
      })
    : [];

  const firstCompletedByCustomer = new Map<string, (typeof completed)[number]>();
  for (const booking of completed) {
    const previous = firstCompletedByCustomer.get(booking.customerId);
    if (!previous || booking.bookingDate < previous.bookingDate) {
      firstCompletedByCustomer.set(booking.customerId, booking);
    }
  }

  const rows = new Map<string, TrialSourceRow>();
  for (const source of TRIAL_BOOKING_SOURCES) {
    rows.set(source, {
      source,
      label: TRIAL_BOOKING_SOURCE_LABELS[source],
      bookings: 0,
      sourceShare: 0,
      bookedPeople: 0,
      attendees: 0,
      attendanceRate: 0,
      assignedCustomers: 0,
      planRate: 0,
    });
  }
  for (const booking of bookings) {
    const source = TRIAL_BOOKING_SOURCES.find((item) => item === booking.bookingSource) ?? "OTHER";
    const row = rows.get(source)!;
    row.bookings += 1;
    row.bookedPeople += booking.people;
    if (booking.bookingStatus === "COMPLETED") {
      row.attendees += booking.attendedPeople ?? booking.people;
    }
  }
  const counted = new Set<string>();
  for (const wallet of wallets) {
    const first = firstCompletedByCustomer.get(wallet.customerId);
    if (!first || counted.has(wallet.customerId)) continue;
    if (wallet.createdAt < first.createdAt) continue;
    const source = TRIAL_BOOKING_SOURCES.find((item) => item === first.bookingSource) ?? "OTHER";
    rows.get(source)!.assignedCustomers += 1;
    counted.add(wallet.customerId);
  }
  for (const row of rows.values()) {
    row.sourceShare = bookings.length ? (row.bookings / bookings.length) * 100 : 0;
    row.attendanceRate = row.bookedPeople ? (row.attendees / row.bookedPeople) * 100 : 0;
    // Conversion denominator counts identifiable customers, not unlinked companions.
    const completedCustomers = [...firstCompletedByCustomer.values()].filter((booking) =>
      (TRIAL_BOOKING_SOURCES.find((item) => item === booking.bookingSource) ?? "OTHER") === row.source
    ).length;
    row.planRate = completedCustomers ? (row.assignedCustomers / completedCustomers) * 100 : 0;
  }
  return [...rows.values()];
}
