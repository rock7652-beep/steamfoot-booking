import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient, UserRole } from "@prisma/client";
import { resolveBookingIntegrationTestDatabaseUrl } from "./helpers/booking-integration-test-db";
import { toLocalDateStr } from "@/lib/date-utils";
import { setPgRequestStore } from "./helpers/pg-request-context";

// Only HTTP identity/cache boundaries are replaced. Permissions, store access,
// feature grants, transactions, row locks and ledger writes use production code.
const identity = vi.hoisted(() => ({ actor: {
  id: "", name: "隔離驗收", role: "ADMIN" as UserRole,
  storeId: "", staffId: null as string | null, customerId: null,
  email: null, storeSlug: null,
} }));
vi.mock("@/lib/session", () => ({ requireStaffSession: async () => identity.actor }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(),
}));
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { resolveBookingIntegrationTestDatabaseUrl } = await import("./helpers/booking-integration-test-db");
  return { prisma: new PrismaClient({ datasourceUrl:
    resolveBookingIntegrationTestDatabaseUrl(process.env) ?? "postgresql://unused:unused@127.0.0.1:5432/unused_test" }) };
});
import { prisma } from "@/lib/db";
import { saveOrder, savePayment } from "@/server/actions/inventory";
import { settleInventory, correctInventoryPayment } from "@/server/services/inventory-settlement";

const url = resolveBookingIntegrationTestDatabaseUrl(process.env);
(url ? describe : describe.skip)("inventory returns — disposable PostgreSQL", () => {
  const db = prisma as PrismaClient;
  let storeId: string, productId: string, orderId: string, paymentId: string;
  let admin: typeof identity.actor, staff: typeof identity.actor;
  const date = toLocalDateStr();
  beforeEach(async () => {
    const prefix = `returns_${randomUUID()}`;
    const store = await db.store.create({ data: { name: prefix, slug: prefix, plan: "ALLIANCE" } });
    storeId = store.id;
    setPgRequestStore(storeId);
    await db.storeFeatureEntitlement.createMany({ data:
      ["inventory", "cashbook"].map(featureKey => ({ storeId, featureKey, status: "ENABLED" as const })) });
    const owner = await db.user.create({ data: { name: prefix, role: "ADMIN" } });
    admin = { ...identity.actor, id: owner.id, role: "ADMIN", staffId: null, storeId };
    identity.actor = admin;
    const user = await db.user.create({ data: { name: prefix, role: "STAFF" } });
    const employee = await db.staff.create({ data: { userId: user.id, storeId, displayName: prefix,
      permissions: { create: ["inventory.read", "inventory.write", "inventory.receive", "cashbook.create"]
        .map(permission => ({ permission, granted: true })) } } });
    staff = { ...admin, id: user.id, role: "STAFF", staffId: employee.id };
    const customer = await db.customer.create({ data: { storeId, name: prefix, phone: prefix } });
    const product = await db.inventoryProduct.create({ data: { storeId, name: prefix, stock: 10, price: 200, averageCost: 50 } });
    productId = product.id;
    const sale = await saveOrder({ requestId: randomUUID(), kind: "SALE", date, partyId: customer.id,
      lines: [{ productId, quantity: 1, unitPrice: 200, discountMode: "NONE", discount: 0, gift: false }],
      paid: 0, method: "未付款" });
    if (!sale.success) throw new Error(JSON.stringify(sale));
    orderId = sale.data;
    const receipt = await savePayment({ requestId: randomUUID(), kind: "SALE", date,
      method: "現金", allocations: [{ orderId, amount: 200 }] });
    if (!receipt.success) throw new Error(JSON.stringify(receipt));
    paymentId = receipt.data;
  });
  afterAll(async () => { await db.$disconnect(); });
  function refund() { return { requestId: randomUUID(), orderId, revision: 2, kind: "RETURN",
    date, reason: "隔離退貨驗收", refund: 200, method: "現金", freight: 0,
    lines: [{ productId, quantity: 1, restock: true }] }; }
  function correction() { return { requestId: randomUUID(), paymentId, date,
    reason: "隔離收款更正驗收", method: "轉帳" }; }
  async function snapshot() {
    return { order: await db.inventoryOrder.findUniqueOrThrow({ where: { id: orderId } }),
      product: await db.inventoryProduct.findUniqueOrThrow({ where: { id: productId } }),
      payments: await db.inventoryPayment.findMany({ where: { storeId }, orderBy: { id: "asc" } }),
      cash: await db.cashbookEntry.findMany({ where: { storeId }, orderBy: { id: "asc" } }),
      commands: await db.inventoryCommand.findMany({ where: { storeId }, orderBy: { id: "asc" } }),
      audits: await db.auditLog.findMany({ where: { storeId }, orderBy: { id: "asc" } }) };
  }
  it("ordinary staff direct refund and correction are denied without any mutation", async () => {
    const before = await snapshot();
    identity.actor = staff;
    await expect(settleInventory(refund())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(correctInventoryPayment(correction())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await snapshot()).toEqual(before);
  });
  it("20 identical refund requests restore stock and refund cash exactly once", async () => {
    const input = refund();
    expect(new Set(await Promise.all(Array.from({ length: 20 }, () => settleInventory(input))))).toEqual(new Set([orderId]));
    const state = await snapshot();
    expect(state.order).toMatchObject({ paid: 0, total: 0, revision: 3 });
    expect(state.order.settlements).toHaveLength(1);
    expect(state.product.stock).toBe(10);
    expect(state.cash.filter(e => e.category === "銷貨退款")).toHaveLength(1);
    expect(state.commands.filter(c => c.requestId === input.requestId)).toHaveLength(1);
    expect(state.payments).toHaveLength(1);
    await expect(settleInventory({ ...input, reason: "不同內容" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await snapshot()).toEqual(state);
  });
  it("20 identical corrections create only one reversal and replacement receipt", async () => {
    const input = correction();
    expect(new Set(await Promise.all(Array.from({ length: 20 }, () => correctInventoryPayment(input))))).toEqual(new Set([paymentId]));
    const state = await snapshot();
    expect(state.order.paid).toBe(200);
    expect(state.product.stock).toBe(9);
    expect(state.payments).toHaveLength(2);
    expect(state.cash.filter(e => e.type === "EXPENSE")).toHaveLength(1);
    expect(state.commands.filter(c => c.requestId === input.requestId)).toHaveLength(1);
    expect(await correctInventoryPayment(input)).toBe(paymentId);
    expect(await snapshot()).toEqual(state);
  });
});
