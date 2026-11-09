import "server-only";
import { prisma } from "@/lib/db";
import { auditRecord, auditText, type AuditReferences } from "@/lib/audit-presentation";

type AuditEvidenceRow = {
  id: string; storeId: string | null; targetType: string; targetId: string;
  action: string; afterJson?: unknown;
  actorUserId?: string;
};

/** Read-only supplement to an authorized audit page. Never rewrite historical
 * snapshots or infer historical products from the order's current cart. */
export async function readLegacyAddOnAuditEvidence(rows: AuditEvidenceRow[]) {
  const result = new Map<string, AuditReferences>();
  const candidates = rows.filter(row => {
    const snapshot = auditRecord(row.afterJson);
    return row.storeId && row.targetType === "ServiceAddOnOrder" &&
      /^(SHARED_GOODS|ADD_ON)_(COLLECT|REFUND)$/.test(row.action) &&
      typeof snapshot.id === "string" && Number.isSafeInteger(snapshot.amount) && snapshot.amount !== 0 &&
      (!(typeof snapshot.customerName === "string" && snapshot.customerName.trim()) || snapshot.items === undefined);
  });
  if (!candidates.length) return result;
  const receipts = await prisma.serviceAddOnReceipt.findMany({
    where: { OR: candidates.map(row => ({ id: String(auditRecord(row.afterJson).id), storeId: row.storeId! })) },
    select: { id: true, storeId: true, orderId: true, amount: true, method: true, actorId: true },
  });
  if (!receipts.length) return result;
  const [cashEntries, orders] = await Promise.all([
    prisma.cashbookEntry.findMany({
      where: { OR: receipts.map(receipt => ({ id: `addon:${receipt.id}`, storeId: receipt.storeId })) },
      select: { id: true, storeId: true, amount: true, type: true, customerId: true, createdByUserId: true, note: true },
    }),
    prisma.serviceAddOnOrder.findMany({
      where: { OR: receipts.map(receipt => ({ id: receipt.orderId, storeId: receipt.storeId })) },
      select: { id: true, storeId: true, ownership: true, participantId: true, reservationKey: true },
    }),
  ]);
  const verified: { row: AuditEvidenceRow; customerId: string | null; items: string }[] = [];
  for (const row of candidates) {
    const snapshot = auditRecord(row.afterJson);
    const receipt = receipts.find(item => item.id === snapshot.id && item.storeId === row.storeId);
    if (!receipt || receipt.amount !== snapshot.amount || (receipt.amount < 0) !== row.action.endsWith("_REFUND")) continue;
    if (row.actorUserId && row.actorUserId !== receipt.actorId) continue;
    const order = orders.find(item => item.id === receipt.orderId && item.storeId === row.storeId);
    if (!order || (row.action.startsWith("SHARED_GOODS_")
      ? order.ownership !== "RESERVATION" || order.reservationKey !== row.targetId
      : order.ownership !== "PERSON" || order.participantId !== row.targetId)) continue;
    const cash = cashEntries.find(item => item.id === `addon:${receipt.id}` && item.storeId === row.storeId);
    if (!cash || Number(cash.amount) !== Math.abs(receipt.amount) || cash.createdByUserId !== receipt.actorId || cash.type !== (receipt.amount < 0 ? "EXPENSE" : "INCOME")) continue;
    const prefix = `${receipt.amount < 0 ? "退回" : "已確認收款"} ${receipt.method}｜`;
    if (!cash.note?.startsWith(prefix)) continue;
    verified.push({ row, customerId: cash.customerId, items: cash.note.slice(prefix.length).trim() });
  }
  if (!verified.length) return result;
  const customerScope = verified.flatMap(item => item.customerId ? [{ id: item.customerId, storeId: item.row.storeId! }] : []);
  const customers = customerScope.length ? await prisma.customer.findMany({ where: { OR: customerScope }, select: { id: true, storeId: true, name: true } }) : [];
  for (const { row, customerId, items } of verified) {
    const snapshot = auditRecord(row.afterJson), references: AuditReferences = {};
    if (snapshot.items === undefined && items) references["receipt:items"] = auditText(items);
    if (!(typeof snapshot.customerName === "string" && snapshot.customerName.trim())) {
      const customer = customers.find(item => item.id === customerId && item.storeId === row.storeId);
      if (customer?.name.trim()) references["receipt:customerName"] = `${auditText(customer.name)}（目前姓名）`;
    }
    if (Object.keys(references).length) result.set(row.id, references);
  }
  return result;
}
