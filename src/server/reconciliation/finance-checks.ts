import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CheckResult } from "./engine";
import { workOrderDetails } from "@/lib/work-orders";

/** Read source receipts and posted ledger in one snapshot, including historical
 * inventory records after HQ disables the feature. Never modify accounting. */
export async function checkInventoryAccounts(storeId: string): Promise<CheckResult[]> {
  return prisma.$transaction(async (tx) => {
    const [orders, payments, entries] = await Promise.all([
      tx.inventoryOrder.findMany({ where: { storeId } }),
      tx.inventoryPayment.findMany({ where: { storeId } }),
      tx.cashbookEntry.findMany({ where: { storeId, id: { startsWith: "inventory:" } } }),
    ]);
    const orderById = new Map(orders.map(order => [order.id, order]));
    const entriesByPayment = new Map<string, typeof entries>();
    for (const entry of entries) {
      const paymentId = entry.id.split(":")[1];
      const group = entriesByPayment.get(paymentId) ?? [];
      group.push(entry);
      entriesByPayment.set(paymentId, group);
    }
    const paid = new Map<string, number>();
    const issues: Array<{ paymentId?: string; orderId?: string; reason: string }> = [];
    const expectedIds = new Set<string>();
    for (const payment of payments) {
      const allocations = Array.isArray(payment.allocations) ? payment.allocations : [];
      let allocated = 0;
      for (const value of allocations) {
        const item = value as { orderId?: string; amount?: number };
        const order = item.orderId ? orderById.get(item.orderId) : undefined;
        const amount = Number(item.amount);
        if (!order || order.kind !== payment.kind || order.partyId !== payment.partyId || !Number.isSafeInteger(amount) || amount <= 0) {
          issues.push({ paymentId: payment.id, orderId: item.orderId, reason: "收款分配與單據不一致" });
          continue;
        }
        allocated += amount;
        paid.set(order.id, (paid.get(order.id) ?? 0) + amount);
      }
      const linked = entriesByPayment.get(payment.id) ?? [];
      const ledgerTotal = linked.reduce((sum, entry) => sum.add(entry.amount), new Prisma.Decimal(0));
      const allowed = payment.kind === "SALE" ? ["goods", "freight"] : ["purchase"];
      for (const suffix of allowed) expectedIds.add(`inventory:${payment.id}:${suffix}`);
      if (allocated !== payment.total || !ledgerTotal.eq(payment.total)
        || linked.some(entry => !allowed.includes(entry.id.split(":").at(-1)!)
          || entry.type !== (payment.kind === "SALE" ? "INCOME" : "EXPENSE")
          || entry.paymentMethod !== (payment.method === "現金" ? "CASH" : "OTHER")
          || entry.entryDate.getTime() !== payment.date.getTime())) {
        issues.push({ paymentId: payment.id, reason: "實收金額、分配、入帳日期或付款方式不一致" });
      }
    }
    for (const order of orders) {
      const settlements=workOrderDetails(order.workOrder)?.settlements??[];
      for(const refund of settlements.filter(s=>s.refund>0)){
        const id=`inventory:${refund.requestId}:refund`;
        if(expectedIds.has(id))issues.push({orderId:order.id,reason:"退款來源重複"});
        expectedIds.add(id);
        const entry=entries.find(e=>e.id===id);
        if(!entry||!new Prisma.Decimal(entry.amount).eq(refund.refund)||entry.type!=="EXPENSE"||entry.category!=="工單退款"||entry.paymentMethod!==(refund.method==="現金"?"CASH":"OTHER")||entry.entryDate.toISOString().slice(0,10)!==refund.date||entry.customerId!==order.partyId)issues.push({orderId:order.id,reason:"工單退款與收支帳不一致"});
      }
      const refunded=settlements.reduce((sum,s)=>sum+s.refund,0);
      if ((paid.get(order.id) ?? 0)-refunded !== order.paid || order.paid > order.total || order.paid < 0)
        issues.push({ orderId: order.id, reason: "累計收款減退款與單據淨已付／欠款不一致" });
    }
    for (const entry of entries) if (!expectedIds.has(entry.id)) issues.push({ reason: `找不到來源收付款：${entry.id}` });
    return [{ checkCode: "inventory_receipt_ledger", checkName: "銷貨／進貨收付款與收支帳",
      status: issues.length ? "mismatch" : "pass", sources: { "收付款筆數": payments.length, "單據筆數": orders.length, "差異筆數": issues.length },
      expected: "每筆實收＝分配金額＝入帳；單據淨已付＝累計收款－退款", debugPayload: { storeId, issues, zeroDataMeansUntested: payments.length === 0 },
    }];
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}

/** Frozen close remains the historical record. A later supplement is exposed
 * as a difference, never silently folded into that frozen snapshot. */
export async function checkClosedCashDrawers(storeId: string, firstDay: Date, lastDay: Date): Promise<CheckResult> {
  const rows = await prisma.$queryRaw<Array<{ id: string; date: string; saved: Prisma.Decimal; current: Prisma.Decimal; sourceIds: string[] }>>`
    WITH sessions AS (
      SELECT * FROM "CashDrawerSession" WHERE "storeId"=${storeId} AND status='CLOSED'
      AND "businessDate">=${firstDay} AND "businessDate"<=${lastDay}
    ), receipts AS (
      SELECT s.id, COALESCE(SUM(CASE
        WHEN t."transactionType"::text='REFUND' AND t."paymentMethod"::text='CASH' THEN t.amount
        WHEN t."transactionType"::text IN ('TRIAL_PURCHASE','SINGLE_PURCHASE','PACKAGE_PURCHASE','SUPPLEMENT')
          AND t."paymentStatus"::text IN ('SUCCESS','CONFIRMED') THEN
          CASE WHEN EXISTS(SELECT 1 FROM "TransactionPaymentSplit" p WHERE p."transactionId"=t.id)
            THEN COALESCE((SELECT SUM(p.amount) FROM "TransactionPaymentSplit" p WHERE p."transactionId"=t.id AND p."paymentMethod"::text='CASH'),0)
            WHEN t."paymentMethod"::text='CASH' THEN t.amount ELSE 0 END
        ELSE 0 END),0) AS amount,
        ARRAY_REMOVE(ARRAY_AGG(t.id),NULL) AS ids
      FROM sessions s LEFT JOIN "Transaction" t ON t."storeId"=s."storeId"
        AND (t."transactionDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Taipei')::date=s."businessDate"
        AND t.status::text='SUCCESS' AND t."voidedAt" IS NULL GROUP BY s.id
    ), ledger AS (
      SELECT s.id, COALESCE(SUM(CASE WHEN e.type::text='INCOME' THEN e.amount
        WHEN e.type::text IN ('EXPENSE','WITHDRAW') THEN -e.amount ELSE 0 END),0) AS amount,
        ARRAY_REMOVE(ARRAY_AGG(e.id),NULL) AS ids
      FROM sessions s LEFT JOIN "CashbookEntry" e ON e."storeId"=s."storeId" AND e."entryDate"=s."businessDate"
        AND e."paymentMethod"::text='CASH' GROUP BY s.id
    ), movements AS (
      SELECT s.id,COALESCE(SUM(CASE WHEN e.direction::text='IN' THEN e.amount ELSE -e.amount END),0) AS amount
      FROM sessions s LEFT JOIN "CashDrawerEntry" e ON e."sessionId"=s.id GROUP BY s.id
    )
    SELECT s.id,s."businessDate"::text AS date,s."expectedClosingCash" AS saved,
      s."openingActualCash"+r.amount+l.amount+m.amount AS current, r.ids||l.ids AS "sourceIds"
    FROM sessions s JOIN receipts r ON r.id=s.id JOIN ledger l ON l.id=s.id JOIN movements m ON m.id=s.id`;
  const issues = rows.filter(row => !new Prisma.Decimal(row.saved).eq(row.current)).map(row => ({
    sessionId: row.id, businessDate: row.date, saved: Number(row.saved), current: Number(row.current),
    difference: new Prisma.Decimal(row.current).sub(row.saved).toNumber(), sourceIds: row.sourceIds,
  }));
  return { checkCode: "cash_drawer_ledger", checkName: "結帳快照與現金收支",
    status: issues.length ? "mismatch" : "pass", sources: { "已結帳日數": rows.length, "差異日數": issues.length },
    expected: "結帳快照與當日現金來源一致；補紀錄差異需核對", debugPayload: { storeId, issues, historicalSnapshotsUnchanged: true } };
}
