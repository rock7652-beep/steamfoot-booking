import { beforeEach, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { lockInventoryCustomerMerge, moveInventoryCustomerRelations } from "./inventory-customer-merge";

const tx = {
    $queryRaw: vi.fn(),
    inventoryOrder: { updateMany: vi.fn() },
    inventoryPayment: { updateMany: vi.fn() },
};
const client = tx as unknown as Prisma.TransactionClient;
beforeEach(() => {
    vi.resetAllMocks();
    tx.$queryRaw.mockResolvedValue([{ orders: true, payments: true }]);
    tx.inventoryOrder.updateMany.mockResolvedValue({ count: 2 });
    tx.inventoryPayment.updateMany.mockResolvedValue({ count: 3 });
});
it("skips inventory only when both optional tables are absent", async () => {
    tx.$queryRaw.mockResolvedValue([{ orders: false, payments: false }]);
    expect(await lockInventoryCustomerMerge(client, "store")).toBe(false);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
});
it("blocks incomplete migration and propagates database errors", async () => {
    tx.$queryRaw.mockResolvedValue([{ orders: true, payments: false }]);
    await expect(lockInventoryCustomerMerge(client, "store")).rejects.toThrow("完整更新");
    tx.$queryRaw.mockRejectedValue(new Error("database unavailable"));
    await expect(lockInventoryCustomerMerge(client, "store")).rejects.toThrow("database unavailable");
});
it("shares the store row lock with stock and receipt transactions", async () => {
    expect(await lockInventoryCustomerMerge(client, "store")).toBe(true);
    expect(tx.$queryRaw.mock.calls[1][0].join("?")).toContain('SELECT id FROM "Store" WHERE id=? FOR UPDATE');
    expect(tx.$queryRaw.mock.calls[1][1]).toBe("store");
});
it("relocates only same-store sales and receipts without rewriting financial snapshots", async () => {
    expect(await moveInventoryCustomerRelations(client, "store", "source", "target"))
        .toEqual({ inventoryOrders: 2, inventoryPayments: 3 });
    expect(tx.inventoryOrder.updateMany).toHaveBeenCalledWith({
        where: { storeId: "store", kind: "SALE", partyId: "source" },
        data: { partyId: "target", revision: { increment: 1 } },
    });
    expect(tx.inventoryPayment.updateMany).toHaveBeenCalledWith({
        where: { storeId: "store", kind: "SALE", partyId: "source" }, data: { partyId: "target" },
    });
});
