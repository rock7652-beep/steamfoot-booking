import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ orders: vi.fn(), payments: vi.fn(), entries: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  $transaction: (work: (tx: unknown) => unknown) => work({
    inventoryOrder: { findMany: db.orders }, inventoryPayment: { findMany: db.payments }, cashbookEntry: { findMany: db.entries },
  }), $queryRaw: db.query,
} }));
import { checkInventoryAccounts, checkClosedCashDrawers } from "@/server/reconciliation/finance-checks";
const date = new Date("2026-10-06T00:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  db.orders.mockResolvedValue([{ id: "o", kind: "SALE", partyId: "c", total: 1000, paid: 500 }]);
  db.payments.mockResolvedValue([{ id: "p", kind: "SALE", partyId: "c", date, total: 500, method: "轉帳", allocations: [{ orderId: "o", amount: 500 }] }]);
  db.entries.mockResolvedValue([{ id: "inventory:p:goods", entryDate: date, type: "INCOME", paymentMethod: "OTHER", amount: 500 }]);
});
it("passes partial collection and does not require the inventory feature to be active", async () => {
  const [result] = await checkInventoryAccounts("store");
  expect(result.status).toBe("pass");
  expect(db.payments).toHaveBeenCalledWith({ where: { storeId: "store" } });
});
it("identifies missing, duplicated or incorrect postings by receipt number", async () => {
  db.entries.mockResolvedValue([{ id: "inventory:p:goods", entryDate: date, type: "INCOME", paymentMethod: "CASH", amount: 1000 }]);
  const [result] = await checkInventoryAccounts("store");
  expect(result.status).toBe("mismatch");
  expect(result.debugPayload.issues).toEqual(expect.arrayContaining([expect.objectContaining({ paymentId: "p" })]));
});
it("identifies wrong order paid balance and orphan ledger entries", async () => {
  db.orders.mockResolvedValue([{ id: "o", kind: "SALE", partyId: "c", total: 1000, paid: 1000 }]);
  db.entries.mockResolvedValue([{ id: "inventory:missing:goods", entryDate: date, type: "INCOME", paymentMethod: "OTHER", amount: 500 }]);
  const [result] = await checkInventoryAccounts("store");
  expect(result.status).toBe("mismatch");
  expect(result.debugPayload.issues).toEqual(expect.arrayContaining([expect.objectContaining({ orderId: "o" })]));
});
it("exposes supplements as differences without rewriting closed snapshots", async () => {
  db.query.mockResolvedValue([{ id: "d", date: "2026-10-06", saved: 1000, current: 1100, sourceIds: ["manual:entry"] }]);
  const result = await checkClosedCashDrawers("store", date, date);
  expect(result.status).toBe("mismatch");
  expect(result.debugPayload.issues).toEqual([expect.objectContaining({ difference: 100, sourceIds: ["manual:entry"] })]);
});
