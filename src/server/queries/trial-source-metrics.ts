import { prisma } from "@/lib/db";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { loadIndividualBookingFacts } from "./booking-participant-facts";
import { loadConversionFacts, selectConversionCustomerIds, type CompletedTrial } from "./conversion-metrics";
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
 * conversion update as the cohort progresses; only actual paid own packages
 * count, using the same first-trial/refund rules as the conversion report.
 * Cancelled bookings stay in the
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

  const latestDate = bookings.reduce((latest, booking) => booking.bookingDate > latest ? booking.bookingDate : latest, new Date());
  const [individual, facts] = await Promise.all([
    loadIndividualBookingFacts(storeId, latestDate),
    loadConversionFacts(storeId, [toLocalDateStr(latestDate).slice(0, 7)]),
  ]);
  const firstTrialByCustomer = new Map<string, CompletedTrial>();
  for (const trial of facts.trials) {
    const previous = firstTrialByCustomer.get(trial.customerId);
    if (!previous || trial.bookingDate < previous.bookingDate ||
      (trial.bookingDate.getTime() === previous.bookingDate.getTime() && (trial.bookingId ?? trial.id ?? "") < (previous.bookingId ?? previous.id ?? ""))) {
      firstTrialByCustomer.set(trial.customerId, trial);
    }
  }
  // All-time first trials decide eligibility; repeated visits cannot be counted
  // as a fresh lead under a second booking source. The selected cohort remains
  // booking-creation date, not purchase month.
  const conversion = selectConversionCustomerIds("", facts.trials, facts.purchases,
    { startDate: "0001-01-01", endDate: toLocalDateStr(latestDate) });
  const completedByBooking = new Map<string, number>();
  for (const visit of individual.visits) {
    if (visit.bookingType !== "FIRST_TRIAL" || visit.source === "WALK_IN") continue;
    completedByBooking.set(visit.bookingId, (completedByBooking.get(visit.bookingId) ?? 0) + 1);
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
    if (individual.groupIds.has(booking.id)) {
      row.attendees += completedByBooking.get(booking.id) ?? 0;
    } else if (booking.bookingStatus === "COMPLETED") {
      row.attendees += booking.attendedPeople ?? booking.people;
    }
  }
  const bookingById = new Map(bookings.map(booking => [booking.id, booking]));
  const eligibleBySource = new Map<string, number>();
  for (const [customerId, trial] of firstTrialByCustomer) {
    const booking = bookingById.get(trial.bookingId ?? trial.id ?? "");
    if (!booking || !conversion.trialCustomerIds.has(customerId)) continue;
    const source = TRIAL_BOOKING_SOURCES.find(item => item === booking.bookingSource) ?? "OTHER";
    eligibleBySource.set(source, (eligibleBySource.get(source) ?? 0) + 1);
    if (conversion.currentTrialConvertedCustomerIds.has(customerId)) rows.get(source)!.assignedCustomers += 1;
  }
  for (const row of rows.values()) {
    row.sourceShare = bookings.length ? (row.bookings / bookings.length) * 100 : 0;
    row.attendanceRate = row.bookedPeople ? (row.attendees / row.bookedPeople) * 100 : 0;
    // Conversion denominator counts identifiable customers, not unlinked companions.
    const completedCustomers = eligibleBySource.get(row.source) ?? 0;
    row.planRate = completedCustomers ? (row.assignedCustomers / completedCustomers) * 100 : 0;
  }
  return [...rows.values()];
}
