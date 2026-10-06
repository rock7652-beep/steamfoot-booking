import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { Prisma, CashDrawerSession } from "@prisma/client";
import { resolveBookingIntegrationTestDatabaseUrl } from "./helpers/booking-integration-test-db";

// Authentication and Next request invalidation are boundaries; all financial
// services, SQL, row locks, snapshots and audit writes use the real database.
const boundary = vi.hoisted(() => ({ actor: { id: "", name: "財務驗收", role: "ADMIN" as const,
  storeId: "", staffId: null, customerId: null, email: null, storeSlug: null } }));
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { resolveBookingIntegrationTestDatabaseUrl } = await import("./helpers/booking-integration-test-db");
  const url = resolveBookingIntegrationTestDatabaseUrl(process.env);
  return { prisma: new PrismaClient({ datasourceUrl: url ?? "postgresql://unused:unused@127.0.0.1:5432/unused_test" }) };
});
vi.mock("@/lib/permissions", () => ({
  requirePermission: vi.fn(async () => boundary.actor),
  requireWritablePermission: vi.fn(async () => boundary.actor),
  checkPermission: vi.fn(async () => true),
}));
vi.mock("@/lib/store", () => ({
  resolveWriteStoreId: vi.fn(async () => boundary.actor.storeId),
  getActiveStoreForRead: vi.fn(async () => boundary.actor.storeId),
}));
vi.mock("@/lib/feature-gate", () => ({
  hasStoreFeature: vi.fn(async () => true), checkCurrentStoreFeature: vi.fn(async () => true),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/manager-visibility", () => ({ assertStoreAccess: vi.fn() }));
import { prisma as appDb } from "@/lib/db";
import { saveOrder, savePayment } from "@/server/actions/inventory";
import { createCashbookEntry } from "@/server/actions/cashbook";
import { closeCashDrawer, computeCashbookCashMovementsForSession } from "@/server/services/cash-drawer";
import { checkInventoryAccounts, checkClosedCashDrawers } from "@/server/reconciliation/finance-checks";

const url = resolveBookingIntegrationTestDatabaseUrl(process.env);
const pg = url ? describe : describe.skip;
pg("finance production paths — disposable multi-connection PostgreSQL", () => {
  const db = appDb as PrismaClient;
  const day = new Date("2099-01-05T00:00:00Z");
  let storeId: string, customerId: string, productId: string, sessionId: string;
  beforeEach(async () => {
    vi.restoreAllMocks();
    const prefix = `finance_${randomUUID()}`;
    const store = await db.store.create({ data: { name: prefix, slug: prefix, plan: "ALLIANCE" } });
    storeId = store.id;
    await db.storeFeatureEntitlement.create({ data: { storeId, featureKey: "inventory", status: "ENABLED" } });
    const actor = await db.user.create({ data: { name: prefix, role: "ADMIN" } });
    boundary.actor = { ...boundary.actor, id: actor.id, storeId };
    const customer = await db.customer.create({ data: { storeId, name: "驗收顧客", phone: prefix } });
    customerId = customer.id;
    const product = await db.inventoryProduct.create({ data: { storeId, name: "驗收商品", stock: 10, price: 200, averageCost: 100 } });
    productId = product.id;
    const session = await db.cashDrawerSession.create({ data: { storeId, businessDate: day,
      openedByUserId: actor.id, openingBookBalance: 1000, openingActualCash: 1000, openingDifference: 0 } });
    sessionId = session.id;
  });
  afterAll(async () => { await db.$disconnect(); });

  function sale(extra = {}) { return { requestId: randomUUID(), kind: "SALE", date: "2099-01-05", partyId: customerId,
    lines: [{ productId, quantity: 2, unitPrice: 200, discountMode: "NONE", discount: 0, gift: false }],
    paid: 0, method: "未付款", ...extra }; }
  async function newOrder(extra = {}) {
    const result = await saveOrder(sale(extra));
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(JSON.stringify(result));
    return result.data;
  }
  function receipt(orderId: string, amount: number, method = "現金") {
    return { requestId: randomUUID(), kind: "SALE", date: "2099-01-05", method, allocations: [{ orderId, amount }] };
  }
  async function cash() {
    const session = await db.cashDrawerSession.findUniqueOrThrow({ where: { id: sessionId } });
    return computeCashbookCashMovementsForSession(session);
  }
  async function stock() { return (await db.inventoryProduct.findUniqueOrThrow({ where: { id: productId } })).stock; }
  async function assertAccounts() { expect((await checkInventoryAccounts(storeId))[0].status).toBe("pass"); }

  it("unpaid sale and concurrent order replay deduct stock once without cash", async () => {
    const input = sale();
    const results = await Promise.all([saveOrder(input), saveOrder(input)]);
    expect(results.every(r => r.success)).toBe(true);
    expect(results[0]).toEqual(results[1]);
    expect(await stock()).toBe(8);
    expect(await db.inventoryOrder.count({ where: { storeId, paid: 0, total: 400 } })).toBe(1);
    expect(await db.cashbookEntry.count({ where: { storeId } })).toBe(0);
    expect((await cash()).cashbookCashIncome.toNumber()).toBe(0);
    await assertAccounts();
  });

  it("partial cash then transfer separates freight, debt, receipts and drawer", async () => {
    const orderId = await newOrder({ delivery: "寄送", channel: "超商", freight: 60 });
    expect((await savePayment(receipt(orderId, 200))).success).toBe(true);
    expect((await db.inventoryOrder.findUniqueOrThrow({ where: { id: orderId } })).paid).toBe(200);
    expect((await cash()).cashbookCashIncome.toNumber()).toBe(200);
    expect((await savePayment(receipt(orderId, 260, "轉帳"))).success).toBe(true);
    const order = await db.inventoryOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.total - order.paid).toBe(0);
    expect(await stock()).toBe(8);
    const entries = await db.cashbookEntry.findMany({ where: { storeId } });
    expect(entries.reduce((n, e) => n + Number(e.amount), 0)).toBe(460);
    expect(entries.filter(e => e.category === "運費收入").reduce((n,e) => n + Number(e.amount),0)).toBe(60);
    expect((await cash()).cashbookCashIncome.toNumber()).toBe(200);
    await assertAccounts();
  });

  it("20 simultaneous identical receipt retries post one receipt and one ledger", async () => {
    const orderId = await newOrder();
    const input = receipt(orderId, 400);
    const results = await Promise.all(Array.from({ length: 20 }, () => savePayment(input)));
    expect(results.every(r => r.success)).toBe(true);
    expect(new Set(results.map(r => r.success ? r.data : "failed")).size).toBe(1);
    expect(await db.inventoryPayment.count({ where: { storeId } })).toBe(1);
    expect(await db.cashbookEntry.count({ where: { storeId } })).toBe(1);
    expect((await cash()).cashbookCashIncome.toNumber()).toBe(400);
    expect(await stock()).toBe(8);
    const conflict = await savePayment({ ...input, allocations: [{ orderId, amount: 399 }] });
    expect(conflict.success).toBe(false);
    await assertAccounts();
  });

  it("two independent receipts cannot overpay and the losing transaction rolls back", async () => {
    const orderId = await newOrder();
    const results = await Promise.all([savePayment(receipt(orderId, 300)), savePayment(receipt(orderId, 300))]);
    expect(results.filter(r => r.success)).toHaveLength(1);
    expect((await db.inventoryOrder.findUniqueOrThrow({ where: { id: orderId } })).paid).toBe(300);
    expect(await db.inventoryPayment.count({ where: { storeId } })).toBe(1);
    expect((await cash()).cashbookCashIncome.toNumber()).toBe(300);
    await assertAccounts();
  });

  it("manual cashbook retries create one entry and one real audit record", async () => {
    const input = { requestId: randomUUID(), entryDate: "2099-01-05", type: "INCOME" as const,
      amount: 150, paymentMethod: "CASH" as const, note: "網路重送驗收" };
    const results = await Promise.all(Array.from({ length: 10 }, () => createCashbookEntry(input)));
    expect(results.every(r => r.success)).toBe(true);
    expect(await db.cashbookEntry.count({ where: { storeId } })).toBe(1);
    expect(await db.auditLog.count({ where: { storeId, targetType: "CashbookEntry", action: "CREATE" } })).toBe(1);
    expect((await createCashbookEntry({ ...input, amount: 151 })).success).toBe(false);
    expect((await cash()).cashbookCashIncome.toNumber()).toBe(150);
  });

  it("cash committed after close calculation is automatically included on retry", async () => {
    const orderId = await newOrder();
    // Only pause scheduling at the first write; invoke Prisma's real UPDATE,
    // including its real P2025 failure. No lock or query result is mocked.
    let announce!: () => void, release!: () => void;
    const reached = new Promise<void>(resolve => { announce = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    const original = db.cashDrawerSession.update.bind(db.cashDrawerSession);
    const closingDelegate = db.cashDrawerSession as unknown as {
      update(args: Prisma.CashDrawerSessionUpdateArgs): Promise<CashDrawerSession>;
    };
    vi.spyOn(closingDelegate, "update").mockImplementationOnce(async args => {
      announce(); await resume; return original(args);
    });
    const closing = closeCashDrawer({ sessionId, actorUserId: boundary.actor.id, closingActualCash: 1400, note: "並行驗收" });
    await reached;
    try { expect((await savePayment(receipt(orderId, 400))).success).toBe(true); }
    finally { release(); }
    const closed = await closing;
    expect(closed.status).toBe("CLOSED");
    expect(closed.expectedClosingCash?.toNumber()).toBe(1400);
    expect(closed.closingDifference?.toNumber()).toBe(0);
    await assertAccounts();
    expect((await checkClosedCashDrawers(storeId, day, day)).status).toBe("pass");
  });

  it("close first rejects subsequent cash atomically, while transfer remains valid", async () => {
    const orderId = await newOrder();
    await closeCashDrawer({ sessionId, actorUserId: boundary.actor.id, closingActualCash: 1000 });
    expect((await savePayment(receipt(orderId, 400))).success).toBe(false);
    expect((await db.inventoryOrder.findUniqueOrThrow({ where: { id: orderId } })).paid).toBe(0);
    expect(await db.inventoryPayment.count({ where: { storeId } })).toBe(0);
    expect(await db.cashbookEntry.count({ where: { storeId } })).toBe(0);
    expect((await saveOrder(sale({ paid: 400, method: "現金" }))).success).toBe(false);
    expect(await stock()).toBe(8); // failed new sale's stock deduction was rolled back
    expect((await savePayment(receipt(orderId, 400, "轉帳"))).success).toBe(true);
    await assertAccounts();
    expect((await checkClosedCashDrawers(storeId, day, day)).status).toBe("pass");
  });
});
