import { prisma } from "@/lib/db";
import { analysisComparisonRanges, parseTaiwanDateToDbDate, previousAnalysisRange, type AnalysisRange } from "@/lib/date-utils";
import { selectConversionCustomerIds, type CompletedTrial, type PackagePurchase } from "./conversion-metrics";
import { hydrateCustomerSegment } from "./customer-segment-list";
import type { CustomerKpiSegment } from "./customer-kpi-segments";
import { loadIndividualBookingFacts, replaceGroupedBookingFacts } from "./booking-participant-facts";

type Visit = CompletedTrial & { bookingType: string };
export function selectPeriodFacts(range: AnalysisRange, previous: AnalysisRange, visits: Visit[], first: Map<string, Date>, trials: CompletedTrial[], purchases: PackagePurchase[]) {
  const within = (date: Date, r: AnalysisRange) => date >= parseTaiwanDateToDbDate(r.startDate) && date <= parseTaiwanDateToDbDate(r.endDate);
  const rows = visits.filter(v => within(v.bookingDate, range));
  const visitors = new Set(rows.map(v => v.customerId));
  const newVisitors = new Set([...visitors].filter(id => first.has(id) && within(first.get(id)!, range)));
  const returning = new Set([...visitors].filter(id => first.has(id) && first.get(id)! < parseTaiwanDateToDbDate(range.startDate)));
  const trialRows = rows.filter(v => v.bookingType === "FIRST_TRIAL");
  const trialIds = new Set(trialRows.map(v => v.customerId));
  const conversion = selectConversionCustomerIds(range.startDate.slice(0, 7), trials, purchases, range);
  const cohort = new Set(visits.filter(v => within(v.bookingDate, previous)).map(v => v.customerId));
  const returned = new Set([...cohort].filter(id => visitors.has(id)));
  const notReturned = new Set([...cohort].filter(id => !visitors.has(id)));
  const attendees = (items: CompletedTrial[]) => items.reduce((sum, v) => sum + (v.attendedPeople ?? v.people ?? 1), 0);
  const trialAttendees = attendees(trialRows);
  const currentConverted = conversion.currentTrialConvertedCustomerIds.size;
  return {
    counts: {
      uniqueVisitors: visitors.size, newVisitors: newVisitors.size, returningVisitors: returning.size,
      trialAttendees, unidentifiedTrialVisits: trialRows.reduce((sum, row) => sum + Math.max(0, (row.attendedPeople ?? row.people ?? 1) - 1), 0),
      trialBookingGroups: new Set(trialRows.map((row, index) => row.bookingId ?? row.id ?? `legacy-${index}`)).size, completedServices: attendees(rows),
      currentTrialConversions: currentConverted, trackedConversions: conversion.trackedConvertedCustomerIds.size,
      convertedCustomers: conversion.convertedCustomerIds.size,
      conversionRate: conversion.trialCustomerIds.size ? currentConverted / conversion.trialCustomerIds.size * 100 : 0,
      unconvertedCustomers: conversion.unconvertedCustomerIds.size,
      returnedCustomers: returned.size, retentionRate: cohort.size ? returned.size / cohort.size * 100 : 0,
      unreturnedCustomers: notReturned.size,
    },
    segments: {
      "monthly-customers": visitors, "monthly-new": newVisitors, "monthly-returning": returning,
      "monthly-trial": trialIds, "monthly-converted": conversion.convertedCustomerIds,
      "monthly-current-trial-converted": conversion.currentTrialConvertedCustomerIds,
      "monthly-tracked-converted": conversion.trackedConvertedCustomerIds,
      "monthly-unconverted": conversion.unconvertedCustomerIds,
      "monthly-returned": returned, "monthly-not-returned": notReturned,
    } satisfies Record<CustomerKpiSegment, Set<string>>,
  };
}

async function loadPeriodFacts(storeId: string, ranges: AnalysisRange[]) {
  const latest = ranges.map(r => r.endDate).sort().at(-1)!;
  const [groupedVisits, groupedTrials, individual] = await Promise.all([
    prisma.booking.findMany({ where: { storeId, bookingStatus: "COMPLETED", OR: ranges.map(r => ({ bookingDate: { gte: parseTaiwanDateToDbDate(r.startDate), lte: parseTaiwanDateToDbDate(r.endDate) } })) }, select: { id: true, customerId: true, bookingDate: true, bookingType: true, people: true, attendedPeople: true } }),
    prisma.booking.findMany({ where: { storeId, bookingStatus: "COMPLETED", bookingType: "FIRST_TRIAL", bookingDate: { lte: parseTaiwanDateToDbDate(latest) } }, select: { id: true, customerId: true, bookingDate: true, people: true, attendedPeople: true } }),
    loadIndividualBookingFacts(storeId, parseTaiwanDateToDbDate(latest)),
  ]);
  const visits = [...replaceGroupedBookingFacts(groupedVisits, individual.groupIds), ...individual.visits];
  const trials = [...replaceGroupedBookingFacts(groupedTrials, individual.groupIds), ...individual.visits.filter(visit => visit.bookingType === "FIRST_TRIAL")];
  const ids = [...new Set(visits.map(v => v.customerId))];
  const trialIds = [...new Set(trials.map(v => v.customerId))];
  const [firstRows, purchases] = await Promise.all([
    ids.length ? prisma.booking.groupBy({ by: ["customerId"], where: { storeId, bookingStatus: "COMPLETED", customerId: { in: ids },
      ...(individual.groupIds.size ? { id: { notIn: [...individual.groupIds] } } : {}) }, _min: { bookingDate: true } }) : [],
    trialIds.length ? prisma.transaction.findMany({ where: { storeId, customerId: { in: trialIds }, transactionType: "PACKAGE_PURCHASE", status: "SUCCESS", paymentStatus: { in: ["SUCCESS", "CONFIRMED"] }, customerPlanWalletId: { not: null },
      OR: [{ paidAt: { lte: new Date() } }, { paidAt: null, transactionDate: { lte: new Date() } }] }, select: { customerId: true, transactionDate: true, paidAt: true, amount: true,
      refunds: { where: { status: "SUCCESS", paymentStatus: { in: ["SUCCESS", "CONFIRMED"] } }, select: { amount: true } }, customerPlanWallet: { select: { status: true } } } }) : [],
  ]);
  const first = new Map(firstRows.flatMap(r => r._min.bookingDate ? [[r.customerId, r._min.bookingDate] as const] : []));
  for (const visit of individual.visits) if (!first.has(visit.customerId) || visit.bookingDate < first.get(visit.customerId)!) first.set(visit.customerId, visit.bookingDate);
  return { visits, trials, purchases: purchases.map(purchase => ({ ...purchase,
    netAmount: Number(purchase.amount) + purchase.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0),
  })), first };
}

export async function getAnalysisPeriodMetrics(storeId: string, range: AnalysisRange, preset: string) {
  const periods = analysisComparisonRanges(range, preset);
  const previousCohort = previousAnalysisRange(periods.previousFull, preset);
  const yearCohort = previousAnalysisRange(periods.year, preset);
  const facts = await loadPeriodFacts(storeId, [periods.current, periods.previousFull, previousCohort, periods.year, yearCohort]);
  const select = (r: AnalysisRange, cohort: AnalysisRange) => selectPeriodFacts(r, cohort, facts.visits, facts.first, facts.trials, facts.purchases);
  const current = select(periods.current, periods.previousFull).counts;
  const previous = select(periods.previous, previousCohort).counts;
  const year = select(periods.year, yearCohort).counts;
  const compare = (n: number, b: number) => ({ difference: n - b, percentage: b ? (n - b) / b * 100 : null });
  const metrics = Object.fromEntries(Object.entries(current).map(([key, value]) => [key, { current: value, mom: compare(value, previous[key as keyof typeof previous]), yoy: compare(value, year[key as keyof typeof year]) }])) as Record<keyof typeof current, { current: number; mom: ReturnType<typeof compare>; yoy: ReturnType<typeof compare> }>;
  return { metrics, periods };
}

export async function getAnalysisPeriodCustomers(storeId: string, range: AnalysisRange, preset: string, segment: CustomerKpiSegment) {
  const periods = analysisComparisonRanges(range, preset);
  const facts = await loadPeriodFacts(storeId, [periods.current, periods.previousFull]);
  const selection = selectPeriodFacts(periods.current, periods.previousFull, facts.visits, facts.first, facts.trials, facts.purchases);
  return hydrateCustomerSegment(storeId, selection.segments[segment]);
}
