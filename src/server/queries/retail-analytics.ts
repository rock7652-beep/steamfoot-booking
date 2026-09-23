import "server-only";
import { prisma } from "@/lib/db";

export type RetailAnalytics = {
  revenue: number;
  transactionCount: number;
  customerCount: number;
  items: { name: string; revenue: number; transactionCount: number; customerCount: number }[];
  otherDaily?: { date: string; revenue: number }[];
  otherIncome?: { revenue: number; transactionCount: number };
  transactions?: { id: string; date: string; kind: string; name: string; amount: number; customerName: string; payment: string }[];
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
        NOT: { id: { startsWith: "course-" } },
        entryDate: {
          gte: new Date(`${from}T00:00:00.000Z`),
          lte: new Date(`${to}T00:00:00.000Z`),
        },
      },
      select: { id: true, entryDate: true, amount: true, category: true, note: true, paymentMethod: true, customerId: true, staffId: true, customer: { select: { name: true } } },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "test" && error instanceof Error && error.message.includes("You must provide a nonempty URL")) return empty;
    throw error;
  }
  const visible = rows.filter((row) => staffMatches(row.staffId) && !row.id.startsWith("course-"));
  const filtered = visible.filter(row => row.category?.startsWith("零售-"));
  const other = visible.filter(row => !row.category?.startsWith("零售-"));
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
  const otherDaily = new Map<string, number>();
  for (const row of other) {
    const date = row.entryDate.toISOString().slice(0, 10);
    otherDaily.set(date, (otherDaily.get(date) ?? 0) + Number(row.amount));
  }
  return {
    otherDaily: [...otherDaily].map(([date, revenue]) => ({ date, revenue })).sort((a,b) => a.date.localeCompare(b.date)),
    otherIncome: { revenue: other.reduce((sum, row) => sum + Number(row.amount), 0), transactionCount: other.length },
    transactions: visible.map(row => ({ id: row.id, date: row.entryDate.toISOString().slice(0, 10), kind: row.category?.startsWith("零售-") ? "零售" : "其他收入", name: row.category?.startsWith("零售-") ? row.category.slice(3) : row.note?.trim() || row.category || "其他收入", amount: Number(row.amount), customerName: row.customer?.name ?? "未關聯顧客", payment: row.paymentMethod === "CASH" ? "現金" : "非現金" })).sort((a,b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
    revenue: filtered.reduce((sum, row) => sum + Number(row.amount), 0),
    transactionCount: filtered.length,
    customerCount: customers.size,
    items: [...items.values()]
      .map(({ customers: itemCustomers, ...item }) => ({ ...item, customerCount: itemCustomers.size }))
      .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, "zh-Hant")),
    daily: [...daily].map(([date, revenue]) => ({ date, revenue })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
