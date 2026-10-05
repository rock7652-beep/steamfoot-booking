import type { Prisma } from "@prisma/client";

/** Inventory is optional on installations that have not applied its migration. */
export async function lockInventoryCustomerMerge(tx: Prisma.TransactionClient, storeId: string) {
    const tables = await tx.$queryRaw<Array<{ orders: boolean; payments: boolean }>>`
        SELECT to_regclass('public."InventoryOrder"') IS NOT NULL AS orders,
               to_regclass('public."InventoryPayment"') IS NOT NULL AS payments`;
    if (!tables[0]?.orders && !tables[0]?.payments) return false;
    if (!tables[0]?.orders || !tables[0]?.payments)
        throw new Error("進銷存資料表尚未完整更新，請先完成更新再合併顧客");
    // Same lock as inventory writes: no receipt/sale can slip between relocation
    // and archiving the source customer. Re-read both customers after this lock.
    await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
    return true;
}

export async function moveInventoryCustomerRelations(tx: Prisma.TransactionClient, storeId: string, sourceId: string, targetId: string) {
    const where = { storeId, kind: "SALE", partyId: sourceId };
    const orders = await tx.inventoryOrder.updateMany({ where, data: { partyId: targetId, revision: { increment: 1 } } });
    const payments = await tx.inventoryPayment.updateMany({ where, data: { partyId: targetId } });
    // Names, phone numbers, money, allocations and request hashes remain original
    // document snapshots. Only the owner link changes for search/settlement.
    return { inventoryOrders: orders.count, inventoryPayments: payments.count };
}
