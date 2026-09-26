import { prisma } from "@/lib/db";
import { addTaiwanDuration, analysisComparisonRanges, parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";

export function monthlyVisitorRanges(today = toLocalDateStr()) {
  const startDate = `${today.slice(0, 7)}-01`;
  const endDate = addTaiwanDuration(addTaiwanDuration(startDate, 1, "MONTH"), -1, "DAY");
  const periods = analysisComparisonRanges({ startDate, endDate }, "month", today);
  return [
    { label: "本月截至今天", ...periods.current },
    { label: "上月同期", ...periods.previous },
    { label: "上月整月", ...periods.previousFull },
  ];
}

// Called only beneath the reports page's permission, feature and store-view gates.
// Fetch only IDs and dates for two months; customer details remain click-to-load.
export async function getMonthlyVisitorOverview(storeId: string, today = toLocalDateStr()) {
  const ranges = monthlyVisitorRanges(today);
  const visits = await prisma.booking.findMany({
    where: { storeId, bookingStatus: "COMPLETED", bookingDate: {
      gte: parseTaiwanDateToDbDate(ranges[2].startDate),
      lte: parseTaiwanDateToDbDate(today),
    } },
    select: { customerId: true, bookingDate: true },
  });
  return ranges.map(range => {
    const start = parseTaiwanDateToDbDate(range.startDate);
    const end = parseTaiwanDateToDbDate(range.endDate);
    const count = new Set(visits.filter(v => v.bookingDate >= start && v.bookingDate <= end).map(v => v.customerId)).size;
    return { ...range, count };
  });
}
