import "server-only";
import { prisma } from "@/lib/db";

export type RetailAnalytics = {
  revenue: number;
  transactionCount: number;
  customerCount: number;
  items: { name: string; revenue: number; transactionCount: number; customerCount: number }[];
  daily: { date: string; revenue: number }[];
};

export async function getRetailAnalytics(
  storeId: string,
  from: string,
  to: string,
  staffMatches: (staffId: string | null) => boolean = () => true,
): Promise<RetailAnalytics> {
  const empty: RetailAnalytics = { revenue: 0, transactionCount: 0, customerCount: 0, items: [], daily: [] };
  // Query/unit-test environments that intentionally provide only a module database
  // do not configure the shared cashbook database.
  const cashbook = (prisma as typeof prisma & { cashbookEntry?: typeof prisma.cashbookEntry }).cashbookEntry;
  if (!process.env.DATABASE_URL?.trim() || !cashbook) return empty;
  let rows;
  try {
    rows = await cashbook.findMany({
      where: {
        storeId,
        type: "INCOME",
        category: { startsWith: "零售-" },
        entryDate: {
          gte: new Date(`${from}T00:00:00.000Z`),
          lte: new Date(`${to}T00:00:00.000Z`),
        },
      },
      select: { entryDate: true, amount: true, category: true, customerId: true, staffId: true },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "test" && error instanceof Error && error.message.includes("You must provide a nonempty URL")) return empty;
    throw error;
  }
  const filtered = rows.filter((row) => staffMatches(row.staffId));
  const customers = new Set(filtered.flatMap((row) => row.customerId ? [row.customerId] : []));
  const items = new Map<string, { name: string; revenue: number; transactionCount: number; customers: Set<string> }>();
  const daily = new Map<string, number>();
  for (const row of filtered) {
    const name = row.category?.slice("零售-".length).trim() || "未命名品項";
    const item = items.get(name) ?? { name, revenue: 0, transactionCount: 0, customers: new Set<string>() };
    item.revenue += Number(row.amount);
    item.transactionCount++;
    if (row.customerId) item.customers.add(row.customerId);
    items.set(name, item);
    const date = row.entryDate.toISOString().slice(0, 10);
    daily.set(date, (daily.get(date) ?? 0) + Number(row.amount));
  }
  return {
    revenue: filtered.reduce((sum, row) => sum + Number(row.amount), 0),
    transactionCount: filtered.length,
    customerCount: customers.size,
    items: [...items.values()]
      .map(({ customers: itemCustomers, ...item }) => ({ ...item, customerCount: itemCustomers.size }))
      .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, "zh-Hant")),
    daily: [...daily].map(([date, revenue]) => ({ date, revenue })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
