import "server-only";

import { spaPrisma } from "@/lib/spa-db";
import { requireSpaStore } from "@/lib/industry-module-server";
import { analysisComparisonRanges, dayRange, parseTaiwanDateToDbDate, previousAnalysisRange, type AnalysisRange } from "@/lib/date-utils";

type Visit = { customerId: string; bookingDate: Date; people: number; isTrial: boolean };
type Sale = { customerId: string; createdAt: Date };

export function summarizeSpaPeriod(range: AnalysisRange, previous: AnalysisRange, visits: Visit[], firstVisits: Map<string, Date>, sales: Sale[]) {
  const inRange = (date: Date, bounds: AnalysisRange) => date >= parseTaiwanDateToDbDate(bounds.startDate) && date <= parseTaiwanDateToDbDate(bounds.endDate);
  const selected = visits.filter(visit => inRange(visit.bookingDate, range));
  const visitors = new Set(selected.map(visit => visit.customerId));
  const trial = selected.filter(visit => visit.isTrial);
  const trialCustomers = new Set(trial.map(visit => visit.customerId));
  const newCustomers = [...visitors].filter(id => firstVisits.has(id) && inRange(firstVisits.get(id)!, range)).length;
  const cohort = new Set(visits.filter(visit => inRange(visit.bookingDate, previous)).map(visit => visit.customerId));
  const returned = [...cohort].filter(id => visitors.has(id)).length;
  const periodSales = sales.filter(sale => sale.createdAt >= dayRange(range.startDate).start && sale.createdAt <= dayRange(range.endDate).end);
  const packages = new Set(periodSales.map(sale => sale.customerId));
  const firstSale = new Map<string, Date>();
  for (const sale of sales) if (!firstSale.has(sale.customerId) || sale.createdAt < firstSale.get(sale.customerId)!) firstSale.set(sale.customerId, sale.createdAt);
  const converted = [...trialCustomers].filter(id => {
    const firstTrial = trial.filter(visit => visit.customerId === id).map(visit => visit.bookingDate).sort((a, b) => +a - +b)[0];
    const purchase = firstSale.get(id);
    return purchase && purchase >= dayRange(firstTrial.toISOString().slice(0, 10)).start && purchase <= dayRange(range.endDate).end;
  }).length;
  return {
    serviceVisits: selected.reduce((sum, visit) => sum + visit.people, 0),
    visitors: visitors.size,
    newCustomers,
    trialVisits: trial.reduce((sum, visit) => sum + visit.people, 0),
    trialCustomers: trialCustomers.size,
    packageCustomers: packages.size,
    converted,
    conversionRate: trialCustomers.size ? converted / trialCustomers.size * 100 : 0,
    returned,
    retentionBase: cohort.size,
    retentionRate: cohort.size ? returned / cohort.size * 100 : 0,
  };
}

export async function getSpaAnalysis(storeId: string, range: AnalysisRange, preset: string) {
  await requireSpaStore(storeId);
  const periods = analysisComparisonRanges(range, preset);
  const priorCohort = previousAnalysisRange(periods.previousFull, preset);
  const yearCohort = previousAnalysisRange(periods.year, preset);
  const windows = [periods.current, periods.previousFull, priorCohort, periods.year, yearCohort];
  const latest = windows.map(window => window.endDate).sort().at(-1)!;
  const [visits, sales] = await Promise.all([
    spaPrisma.spaBooking.findMany({
      where: { storeId, status: "COMPLETED", OR: windows.map(window => ({ bookingDate: { gte: parseTaiwanDateToDbDate(window.startDate), lte: parseTaiwanDateToDbDate(window.endDate) } })) },
      select: { customerId: true, bookingDate: true, people: true, isTrial: true },
    }),
    spaPrisma.spaCreditSale.findMany({
      where: { storeId, kind: "PACKAGE", createdAt: { lte: dayRange(latest).end } },
      select: { id: true, customerId: true, createdAt: true },
    }),
  ]);
  const ids = [...new Set(visits.map(visit => visit.customerId))];
  const [firstRows, voids] = await Promise.all([
    ids.length ? spaPrisma.spaBooking.groupBy({ by: ["customerId"], where: { storeId, status: "COMPLETED", customerId: { in: ids } }, _min: { bookingDate: true } }) : [],
    sales.length ? spaPrisma.spaPaymentRevision.findMany({ where: { storeId, action: "VOID", kind: "SALE", sourceId: { in: sales.map(sale => sale.id) } }, select: { sourceId: true } }) : [],
  ]);
  const firstVisits = new Map(firstRows.flatMap(row => row._min.bookingDate ? [[row.customerId, row._min.bookingDate] as const] : []));
  const voided = new Set(voids.map(voidRow => voidRow.sourceId));
  const paidSales = sales.filter(sale => !voided.has(sale.id));
  const current = summarizeSpaPeriod(periods.current, periods.previousFull, visits, firstVisits, paidSales);
  const prior = summarizeSpaPeriod(periods.previous, priorCohort, visits, firstVisits, paidSales);
  const year = summarizeSpaPeriod(periods.year, yearCohort, visits, firstVisits, paidSales);
  const compare = (value: number, baseline: number) => baseline ? (value - baseline) / baseline * 100 : null;
  return { current, periods, comparisons: Object.fromEntries(Object.keys(current).map(key => [key, {
    previous: compare(current[key as keyof typeof current], prior[key as keyof typeof prior]),
    year: compare(current[key as keyof typeof current], year[key as keyof typeof year]),
  }])) as Record<keyof typeof current, { previous: number | null; year: number | null }> };
}
