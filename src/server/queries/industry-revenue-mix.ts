import "server-only";

import { requireInventoryFinanceAccess } from "@/server/inventory-finance-access";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { isSpaExternalPayment } from "@/lib/spa-payment-methods";
import { getRevenueMix, type RevenueMix, type RevenueMixPoint } from "./revenue-mix";
import { isRetailCashbookCategory } from "@/lib/cashbook-entry-kind";

type RevenueField = "packageRevenue" | "retailRevenue" | "otherRevenue" | "refunds" | "expense";
type Event = { date: string; field: RevenueField; amount: number; manual?: boolean };

function fromEvents(events: Event[], startDate: string, endDate: string): RevenueMix {
  const monthly = (Date.parse(endDate) - Date.parse(startDate)) / 86400000 > 62;
  const points = new Map<string, RevenueMixPoint>();
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const key = monthly ? date.slice(0, 7) : date;
    if (!points.has(key)) points.set(key, {
      key, label: monthly ? key.replace("-", "/") : date.slice(5).replace("-", "/"),
      packageRevenue: 0, retailRevenue: 0, otherRevenue: 0, refunds: 0,
      expense: 0, netRevenue: 0, balance: 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  let manualIncome = 0;
  for (const event of events) {
    if (event.date < startDate || event.date > endDate) continue;
    const point = points.get(monthly ? event.date.slice(0, 7) : event.date);
    if (!point) continue;
    point[event.field] += event.amount;
    if (event.manual && event.field !== "expense") manualIncome += event.amount;
  }
  const summary = { packageRevenue: 0, retailRevenue: 0, otherRevenue: 0, refunds: 0, expense: 0 };
  for (const point of points.values()) {
    point.netRevenue = point.packageRevenue + point.retailRevenue + point.otherRevenue - point.refunds;
    point.balance = point.netRevenue - point.expense;
    for (const field of Object.keys(summary) as RevenueField[]) summary[field] += point[field];
  }
  const grossRevenue = summary.packageRevenue + summary.retailRevenue + summary.otherRevenue;
  const netRevenue = grossRevenue - summary.refunds;
  const share = (amount: number) => grossRevenue > 0 ? amount / grossRevenue * 100 : 0;
  return { ...summary, grossRevenue, netRevenue, balance: netRevenue - summary.expense,
    pendingRevenue: 0, manualIncome,
    packageShare: share(summary.packageRevenue), retailShare: share(summary.retailRevenue), otherShare: share(summary.otherRevenue),
    trendLabel: monthly ? "逐月走勢" : "逐日走勢", points: [...points.values()],
  };
}

async function cashbookEvents(storeId: string, startDate: string, endDate: string): Promise<Event[]> {
  const entries = await prisma.cashbookEntry.findMany({
    where: { storeId, type: { in: ["INCOME", "EXPENSE"] },
      entryDate: { gte: new Date(`${startDate}T00:00:00Z`), lte: new Date(`${endDate}T00:00:00Z`) } },
    select: { id: true, entryDate: true, type: true, category: true, amount: true },
  });
  return entries.map((entry) => {
    const id = entry.id ?? "";
    // Course receipts already post to this ledger. Read their entryDate and
    // amount once, including split payments and their compensating entries.
    const refund = /^course-(refund|void|trial-void|rental-void):/.test(id)||(/^inventory:.*:refund$/.test(id)&&["工單退款","銷貨退款"].includes(entry.category??""));
    const feeReversal = /^course-(fee|profit)-void:/.test(id);
    const linked = id.startsWith("course:") || id.startsWith("course-") || id.startsWith("inventory:");
    const correction=id.startsWith("inventory:")&&id.includes(":correction:");
    const field: RevenueField = correction ? (isRetailCashbookCategory(entry.category)?"retailRevenue":"otherRevenue") : refund ? "refunds" : feeReversal ? "expense"
      : entry.type === "EXPENSE" ? "expense" : id.startsWith("course-purchase:") ? "packageRevenue"
      : isRetailCashbookCategory(entry.category) ? "retailRevenue" : "otherRevenue";
    return { date: entry.entryDate.toISOString().slice(0, 10), field,
      amount: Number(entry.amount) * (correction ? -1 : 1) * (feeReversal ? -1 : 1), manual: !linked && entry.type === "INCOME" };
  });
}

async function spaEvents(storeId: string, startDate: string, endDate: string): Promise<Event[]> {
  const range = { gte: dayRange(startDate).start, lte: dayRange(endDate).end };
  const [receipts, sales, refunds] = await Promise.all([
    spaPrisma.spaReceipt.findMany({ where: { storeId, paidAt: range }, select: { id: true, paidAt: true, amount: true, paymentMethod: true } }),
    spaPrisma.spaCreditSale.findMany({ where: { storeId, createdAt: range }, select: { id: true, createdAt: true, kind: true, amount: true, paymentMethod: true } }),
    spaPrisma.spaRefund.findMany({ where: { storeId, createdAt: range }, select: { id: true, createdAt: true, amount: true, paymentMethod: true } }),
  ]);
  const ids = [...receipts.map((r) => r.id), ...sales.map((s) => s.id), ...refunds.map((r) => r.id)];
  const voids = ids.length ? await spaPrisma.spaPaymentRevision.findMany({
    where: { storeId, action: "VOID", OR: [{ sourceId: { in: ids } }, { refundId: { in: refunds.map((r) => r.id) } }] },
    select: { kind: true, sourceId: true, refundId: true },
  }) : [];
  const voided = new Set(voids.map((v) => `${v.kind}:${v.sourceId}`));
  const voidedRefunds = new Set(voids.map((v) => v.refundId).filter(Boolean));
  return [
    ...receipts.filter((r) => isSpaExternalPayment(r.paymentMethod) && !voided.has(`RECEIPT:${r.id}`))
      .map((r): Event => ({ date: toLocalDateStr(r.paidAt), field: "otherRevenue", amount: Number(r.amount) })),
    ...sales.filter((s) => isSpaExternalPayment(s.paymentMethod) && !voided.has(`SALE:${s.id}`))
      .map((s): Event => ({ date: toLocalDateStr(s.createdAt), field: s.kind === "PACKAGE" || s.kind === "TOPUP" ? "packageRevenue" : "otherRevenue", amount: Number(s.amount) })),
    ...refunds.filter((r) => isSpaExternalPayment(r.paymentMethod) && !voidedRefunds.has(r.id))
      .map((r): Event => ({ date: toLocalDateStr(r.createdAt), field: "refunds", amount: Math.abs(Number(r.amount)) })),
  ];
}

export async function getIndustryRevenueMix(storeId: string, startDate: string, endDate: string): Promise<RevenueMix> {
  await requireInventoryFinanceAccess(storeId);
  const industry = await getStoreIndustryModule(storeId);
  if (industry === "steamfoot") return getRevenueMix(storeId, startDate, endDate);
  const [systemEvents, manualEvents] = await Promise.all([
    industry === "spa" ? spaEvents(storeId, startDate, endDate) : Promise.resolve([]),
    cashbookEvents(storeId, startDate, endDate),
  ]);
  return fromEvents([...systemEvents, ...manualEvents], startDate, endDate);
}

export async function getIndustrySixMonthRevenueMixTrend(storeId: string, today = toLocalDateStr()): Promise<RevenueMixPoint[]> {
  const [year, month] = today.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, month - 6, 1)).toISOString().slice(0, 10);
  return (await getIndustryRevenueMix(storeId, startDate, today)).points;
}
