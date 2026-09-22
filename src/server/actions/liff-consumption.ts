"use server";

import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { requireSession } from "@/lib/session";
import { getCanonicalCustomerIdForSession } from "@/lib/customer-identity";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { resolveCentralMemberCustomerForStore } from "@/server/services/central-member-resolver";
import { resolveMemberRequestStoreId } from "@/server/services/member-request-store";

export type LiffConsumptionRow = {
  id: string;
  date: string;
  item: string;
  amount: number;
  paymentMethod: string;
  status: string;
};

export type FetchLiffConsumptionResult =
  | { status: "ok"; rows: LiffConsumptionRow[] }
  | { status: "no_customer" }
  | { status: "service_unavailable" };

const PAYMENT: Record<string, string> = {
  CASH: "現金",
  TRANSFER: "轉帳",
  BANK_TRANSFER: "轉帳",
  LINE_PAY: "LINE Pay",
  CREDIT_CARD: "信用卡",
  CARD: "信用卡",
  OTHER: "其他（轉帳／非現金）",
  STORED_VALUE: "儲值金",
};

function paymentLabel(value: string) {
  return PAYMENT[value] ?? "其他";
}

export async function fetchLiffConsumption(): Promise<FetchLiffConsumptionResult> {
  try {
    const user = await requireSession();
    if (user.role !== "CUSTOMER") return { status: "no_customer" };
    const storeId = await resolveMemberRequestStoreId(user.storeId ?? null);
    if (!storeId) return { status: "no_customer" };
    const industryModule = await getStoreIndustryModule(storeId);
    const membership = industryModule === "steamfoot"
      ? null
      : await resolveCentralMemberCustomerForStore(user.id, storeId);
    const customerId = membership?.customerId ?? await getCanonicalCustomerIdForSession(user);
    if (!customerId) return { status: "no_customer" };

    const [transactions, cashbook] = await Promise.all([
      prisma.transaction.findMany({
        where: { customerId, storeId, status: { in: ["SUCCESS", "VOIDED"] } },
        select: { id: true, createdAt: true, transactionType: true, planNameSnapshot: true, amount: true, paymentMethod: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.cashbookEntry.findMany({
        where: { customerId, storeId, type: "INCOME" },
        select: { id: true, entryDate: true, createdAt: true, category: true, amount: true, paymentMethod: true, note: true },
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        take: 100,
      }),
    ]);

    const rows: Array<LiffConsumptionRow & { sortAt: Date }> = [
      ...transactions.map((row) => ({
        id: `transaction:${row.id}`,
        date: row.createdAt.toISOString(),
        sortAt: row.createdAt,
        item: row.planNameSnapshot || (row.transactionType === "REFUND" ? "退款" : "方案購買"),
        amount: Number(row.amount),
        paymentMethod: paymentLabel(row.paymentMethod),
        status: row.status === "VOIDED" ? "已取消" : "已收款",
      })),
      ...cashbook.map((row) => ({
        id: `cashbook:${row.id}`,
        date: row.entryDate.toISOString(),
        sortAt: row.createdAt,
        item: row.id.startsWith("course-purchase:")
          ? row.note?.replace(/^線上購買：/, "").split(" / ")[0] || "課程方案"
          : row.category?.replace(/^零售-/, "") || "現場消費",
        amount: Number(row.amount),
        paymentMethod: paymentLabel(row.paymentMethod),
        status: "已收款",
      })),
    ];

    if (industryModule === "spa") {
      const [sales, receipts] = await Promise.all([
        spaPrisma.spaCreditSale.findMany({ where: { storeId, customerId }, select: { id: true, createdAt: true, name: true, amount: true, paymentMethod: true }, orderBy: { createdAt: "desc" }, take: 100 }),
        spaPrisma.spaReceipt.findMany({ where: { storeId, booking: { customerId } }, select: { id: true, paidAt: true, amount: true, paymentMethod: true, booking: { select: { serviceNameSnapshot: true } } }, orderBy: { paidAt: "desc" }, take: 100 }),
      ]);
      rows.push(
        ...sales.map((row) => ({ id: `spa-sale:${row.id}`, date: row.createdAt.toISOString(), sortAt: row.createdAt, item: row.name, amount: Number(row.amount), paymentMethod: paymentLabel(row.paymentMethod), status: "已收款" })),
        ...receipts.map((row) => ({ id: `spa-receipt:${row.id}`, date: row.paidAt.toISOString(), sortAt: row.paidAt, item: row.booking.serviceNameSnapshot || "SPA 服務", amount: Number(row.amount), paymentMethod: paymentLabel(row.paymentMethod), status: "已收款" })),
      );
    }

    return {
      status: "ok",
      rows: rows.sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime()).slice(0, 100).map((row) => ({
        id: row.id,
        date: row.date,
        item: row.item,
        amount: row.amount,
        paymentMethod: row.paymentMethod,
        status: row.status,
      })),
    };
  } catch (error) {
    console.error("[fetchLiffConsumption] failed", error);
    return { status: "service_unavailable" };
  }
}
