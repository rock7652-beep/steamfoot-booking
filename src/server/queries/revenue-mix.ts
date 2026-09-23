import { prisma } from "@/lib/db";
import { dayRange } from "@/lib/date-utils";
import { REVENUE_NET_TYPES, REVENUE_VALID_STATUS } from "@/lib/booking-constants";

export type RevenueMixPoint = {
  key: string;
  label: string;
  packageRevenue: number;
  retailRevenue: number;
  otherRevenue: number;
  refunds: number;
  expense: number;
  balance: number;
};

export type RevenueMix = {
  packageRevenue: number;
  retailRevenue: number;
  otherRevenue: number;
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  expense: number;
  balance: number;
  packageShare: number;
  retailShare: number;
  otherShare: number;
  trendLabel: string;
  points: RevenueMixPoint[];
};

function previousSixDays(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 6)).toISOString().slice(0, 10);
}

function emptyPoint(key: string, monthly: boolean): RevenueMixPoint {
  return {
    key,
    label: monthly ? key.slice(0, 7).replace("-", "/") : key.slice(5).replace("-", "/"),
    packageRevenue: 0,
    retailRevenue: 0,
    otherRevenue: 0,
    refunds: 0,
    expense: 0,
    balance: 0,
  };
}

/** 報表同口徑：成功系統交易的建立日、現金帳的記帳日。提款是資金移轉，不列為支出。 */
export async function getRevenueMix(
  storeId: string,
  startDate: string,
  endDate: string,
): Promise<RevenueMix> {
  const todayOnly = startDate === endDate;
  const trendStart = todayOnly ? previousSixDays(startDate) : startDate;
  const { start } = dayRange(trendStart);
  const { end } = dayRange(endDate);
  const firstDay = new Date(`${trendStart}T00:00:00.000Z`);
  const lastDay = new Date(`${endDate}T00:00:00.000Z`);
  const days = Math.round((lastDay.getTime() - firstDay.getTime()) / 86400000) + 1;
  const monthly = days > 62;

  const [transactions, cashbook] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        storeId,
        status: REVENUE_VALID_STATUS,
        transactionType: { in: REVENUE_NET_TYPES as never },
        createdAt: { gte: start, lte: end },
      },
      select: { createdAt: true, transactionType: true, amount: true },
    }),
    prisma.cashbookEntry.findMany({
      where: {
        storeId,
        type: { in: ["INCOME", "EXPENSE"] },
        entryDate: { gte: firstDay, lte: lastDay },
      },
      select: { entryDate: true, type: true, category: true, amount: true },
    }),
  ]);

  const points = new Map<string, RevenueMixPoint>();
  for (let i = 0; i < days; i++) {
    const date = new Date(firstDay.getTime() + i * 86400000).toISOString().slice(0, 10);
    const key = monthly ? date.slice(0, 7) : date;
    if (!points.has(key)) points.set(key, emptyPoint(key, monthly));
  }
  const inPeriod = (date: string) => date >= startDate && date <= endDate;
  const summary = { packageRevenue: 0, retailRevenue: 0, otherRevenue: 0, refunds: 0, expense: 0 };
  for (const tx of transactions) {
    // createdAt is a timestamp; render its business date in Asia/Taipei.
    const date = new Date(tx.createdAt.getTime() + 8 * 3600000).toISOString().slice(0, 10);
    const point = points.get(monthly ? date.slice(0, 7) : date);
    if (!point) continue;
    const amount = Number(tx.amount);
    const field = tx.transactionType === "PACKAGE_PURCHASE"
      ? "packageRevenue" : tx.transactionType === "REFUND" ? "refunds" : "otherRevenue";
    point[field] += field === "refunds" ? Math.abs(amount) : amount;
    if (inPeriod(date)) summary[field] += field === "refunds" ? Math.abs(amount) : amount;
  }
  for (const entry of cashbook) {
    // entryDate is a PostgreSQL DATE (UTC midnight), not a timestamp.
    const date = entry.entryDate.toISOString().slice(0, 10);
    const point = points.get(monthly ? date.slice(0, 7) : date);
    if (!point) continue;
    const field = entry.type === "EXPENSE" ? "expense"
      : entry.category?.startsWith("零售-") ? "retailRevenue" : "otherRevenue";
    const amount = Number(entry.amount);
    point[field] += amount;
    if (inPeriod(date)) summary[field] += amount;
  }
  for (const point of points.values()) {
    point.balance = point.packageRevenue + point.retailRevenue + point.otherRevenue
      - point.refunds - point.expense;
  }
  const grossRevenue = summary.packageRevenue + summary.retailRevenue + summary.otherRevenue;
  const netRevenue = grossRevenue - summary.refunds;
  const share = (amount: number) => grossRevenue > 0 ? (amount / grossRevenue) * 100 : 0;
  return {
    ...summary,
    grossRevenue,
    netRevenue,
    balance: netRevenue - summary.expense,
    packageShare: share(summary.packageRevenue),
    retailShare: share(summary.retailRevenue),
    otherShare: share(summary.otherRevenue),
    trendLabel: todayOnly ? "近 7 日（日結；摘要僅計所選日期）"
      : monthly ? "逐月走勢" : "逐日走勢",
    points: [...points.values()],
  };
}
