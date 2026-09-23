import { prisma } from "@/lib/db";
import { dayRange } from "@/lib/date-utils";
import {
  TRIAL_BOOKING_SOURCES,
  TRIAL_BOOKING_SOURCE_LABELS,
  type TrialBookingSource,
} from "@/lib/trial-booking-source";

export type TrialSourceRow = {
  source: TrialBookingSource | "UNRECORDED";
  label: string;
  bookings: number;
  attendees: number;
  convertedCustomers: number;
};

/**
 * Cohort by booking creation date in Asia/Taipei. Attendance and paid plan
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
      bookingStatus: true,
      attendedPeople: true,
      people: true,
    },
  });

  const completed = bookings.filter((booking) => booking.bookingStatus === "COMPLETED");
  const customerIds = [...new Set(completed.map((booking) => booking.customerId))];
  const purchases = customerIds.length
    ? await prisma.transaction.findMany({
        where: {
          storeId,
          customerId: { in: customerIds },
          transactionType: "PACKAGE_PURCHASE",
          status: "SUCCESS",
          paymentStatus: { in: ["SUCCESS", "CONFIRMED"] },
          customerPlanWalletId: { not: null },
        },
        select: {
          customerId: true,
          transactionDate: true,
          paidAt: true,
          customerPlanWallet: { select: { status: true } },
        },
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
  for (const source of [...TRIAL_BOOKING_SOURCES, "UNRECORDED" as const]) {
    rows.set(source, {
      source,
      label: source === "UNRECORDED" ? "未記錄" : TRIAL_BOOKING_SOURCE_LABELS[source],
      bookings: 0,
      attendees: 0,
      convertedCustomers: 0,
    });
  }
  for (const booking of bookings) {
    const source = TRIAL_BOOKING_SOURCES.find((item) => item === booking.bookingSource) ?? "UNRECORDED";
    const row = rows.get(source)!;
    row.bookings += 1;
    if (booking.bookingStatus === "COMPLETED") {
      row.attendees += booking.attendedPeople ?? booking.people;
    }
  }
  const counted = new Set<string>();
  for (const purchase of purchases) {
    if (purchase.customerPlanWallet?.status === "CANCELLED") continue;
    const first = firstCompletedByCustomer.get(purchase.customerId);
    if (!first || counted.has(purchase.customerId)) continue;
    if ((purchase.paidAt ?? purchase.transactionDate) < first.bookingDate) continue;
    const source = TRIAL_BOOKING_SOURCES.find((item) => item === first.bookingSource) ?? "UNRECORDED";
    rows.get(source)!.convertedCustomers += 1;
    counted.add(purchase.customerId);
  }
  return [...rows.values()];
}
