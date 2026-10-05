/* eslint-disable @typescript-eslint/no-explicit-any -- In-memory transaction adapter for acceptance scenarios. */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ db: {} as Record<string, any>, permission: vi.fn(), feature: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: mocks.db }));
vi.mock("@/lib/permissions", () => ({ requirePermission: mocks.permission, checkPermission: vi.fn(async () => true) }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: vi.fn(async () => "store-1"), resolveWriteStoreId: vi.fn(async () => "store-1") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: mocks.feature }));
vi.mock("@/lib/data-export-gate", () => ({ hasDataExportFeature: vi.fn(async () => true) }));
vi.mock("@/server/services/operation-audit", () => ({ recordOperationAudit: mocks.audit }));
import { saveInventoryOrder, createInventoryPayment, inventoryTransaction, inventoryContext, inventoryExportEnabled, assertInventoryPreviewIsolation } from "./inventory";
import { saveStockCount, savePayment } from "@/server/actions/inventory";
import { inventoryReport, orderSchema, publicLines, lineTotal } from "@/lib/inventory";
const ctx: any = { storeId: "store-1", canCost: true, user: { id: "user-1", name: "店長", role: "ADMIN", staffId: "staff-1" } };
describe("inventory preview isolation", () => {
    const env = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/inventory-workspace-20261005" };
    const isolated = "postgresql://postgres:fixture@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
    it("rejects missing and non-isolated connections before inventory operations", () => {
        expect(() => assertInventoryPreviewIsolation(env)).toThrow("隔離資料庫");
        expect(() => assertInventoryPreviewIsolation({ ...env, DATABASE_URL: isolated, DIRECT_URL: "postgresql://postgres:fixture@db.other.supabase.co/postgres" })).toThrow("隔離資料庫");
    });
    it("accepts only the isolated project for both connections", () => {
        expect(() => assertInventoryPreviewIsolation({ ...env, DATABASE_URL: isolated, DIRECT_URL: isolated })).not.toThrow();
    });
    it("does not change production or other branches", () => {
        expect(() => assertInventoryPreviewIsolation({ ...env, VERCEL_ENV: "production" })).not.toThrow();
        expect(() => assertInventoryPreviewIsolation({ ...env, VERCEL_GIT_COMMIT_REF: "main" })).not.toThrow();
    });
});
let products: any[], orders: any[], commands: any[], payments: any[], cash: any[], counts: any[], sequence: number;
const matches = (row: any, where: any) => Object.entries(where).every(([k, v]) => typeof v === 'object' && v !== null ? true : row[k] === v);
function apply(row: any, data: any) { for (const [k, v] of Object.entries(data))
    row[k] = v && typeof v === 'object' && 'increment' in v ? row[k] + (v as any).increment : v; return row; }
beforeEach(() => {
    sequence = 0;
    products = [{ id: "a", storeId: ctx.storeId, name: "商品 A", stock: 10, averageCost: new Prisma.Decimal(100), price: 200, revision: 1, active: true }];
    orders = [];
    commands = [];
    payments = [];
    cash = [];
    counts = [];
    mocks.permission.mockResolvedValue(ctx.user);
    mocks.feature.mockResolvedValue(true);
    mocks.audit.mockResolvedValue({});
    mocks.db.$queryRaw = vi.fn(async () => [{ id: ctx.storeId }]);
    mocks.db.storeFeatureEntitlement = { findUnique: vi.fn(async () => ({ status: 'ENABLED', startsAt: null, expiresAt: null })) };
    mocks.db.inventoryStockCount = { findUnique: async ({ where }: any) => counts.find(c => matches(c, where.storeId_requestId)), create: async ({ data }: any) => { const c = { id: `count-${++sequence}`, ...data }; counts.push(c); return c; } };
    mocks.db.inventoryProduct = { findFirst: async ({ where }: any) => products.find(p => matches(p, where)), findFirstOrThrow: async ({ where }: any) => { const p = products.find(p => matches(p, where)); if (!p)
            throw Error('not found'); return p; }, update: async ({ where, data }: any) => apply(products.find(p => p.id === where.id), data) };
    mocks.db.inventoryOrder = { findFirst: async ({ where }: any) => orders.find(o => matches(o, where)), create: async ({ data }: any) => { const o = { id: `order-${++sequence}`, paid: 0, revision: 1, ...data }; orders.push(o); return o; }, update: async ({ where, data }: any) => apply(orders.find(o => o.id === where.id), data) };
    mocks.db.inventoryCommand = { findUnique: async ({ where }: any) => commands.find(c => matches(c, where.storeId_requestId)), create: async ({ data }: any) => { commands.push(data); return data; } };
    mocks.db.customer = { findFirst: async ({ where }: any) => where.id === 'customer-1' && where.storeId === ctx.storeId ? { id: where.id, name: "顧客", phone: "0912345678" } : null };
    mocks.db.inventorySupplier = { findFirst: async ({ where }: any) => ['vendor-1', 'vendor-2'].includes(where.id) && where.storeId === ctx.storeId ? { id: where.id, name: where.id, phone: "0222222222" } : null };
    mocks.db.inventoryPayment = { findUnique: async ({ where }: any) => payments.find(p => matches(p, where.storeId_requestId)), create: async ({ data }: any) => { const p = { id: `payment-${++sequence}`, ...data }; payments.push(p); return p; } };
    mocks.db.cashbookEntry = { create: async ({ data }: any) => { cash.push(data); return data; } };
    mocks.db.cashDrawerSession = { findFirst: vi.fn(async () => null) };
    mocks.db.$transaction = async (fn: any) => { const snapshot = { products: products.map(p => ({ ...p })), orders: orders.map(o => ({ ...o })), commands: [...commands], payments: [...payments], cash: [...cash], counts: [...counts] }; try {
        return await fn(mocks.db);
    }
    catch (e) {
        ({ products, orders, commands, payments, cash, counts } = snapshot);
        throw e;
    } };
});
const input = (override: any = {}) => orderSchema.parse({ requestId: crypto.randomUUID(), kind: "SALE", date: "2026-10-05", partyId: "customer-1", lines: [{ productId: "a", quantity: 2, unitPrice: 200, discountMode: "PERCENT", discount: 10, gift: false }], paid: 0, method: "未付款", ...override });
describe("inventory transaction acceptance", () => {
    it("settles two customer orders once with per-order receipt balances", async () => {
        const a = await saveInventoryOrder(ctx, input());
        const b = await saveInventoryOrder(ctx, input({ delivery: "寄送", channel: "超商", freight: 60 }));
        const payment = { requestId: crypto.randomUUID(), kind: "SALE", date: "2026-10-05", method: "轉帳", allocations: [{ orderId: a, amount: 360 }, { orderId: b, amount: 420 }] };
        expect((await savePayment(payment)).success).toBe(true);
        expect((await savePayment(payment)).success).toBe(true);
        expect(payments).toHaveLength(1);
        expect(payments[0].allocations.map((a: any) => a.remainingAfter)).toEqual([0, 0]);
        expect(orders.map(o => o.paid)).toEqual([360, 420]);
        expect(cash.map(c => [c.category, c.amount])).toEqual([["零售-商品銷售", 720], ["運費收入", 60]]);
        expect(products[0].stock).toBe(6);
    });
    it("rolls back the entire batch when a later allocation overpays", async () => {
        const a = await saveInventoryOrder(ctx, input());
        const b = await saveInventoryOrder(ctx, input());
        const payment = { requestId: crypto.randomUUID(), kind: "SALE", date: "2026-10-05", method: "現金", allocations: [{ orderId: a, amount: 360 }, { orderId: b, amount: 361 }] };
        expect((await savePayment(payment)).success).toBe(false);
        expect(orders.map(o => o.paid)).toEqual([0, 0]);
        expect(payments).toHaveLength(0);
        expect(cash).toHaveLength(0);
    });

    it("settles a partial sale through the receipt action without duplicate cash", async () => {
        await saveInventoryOrder(ctx, input({ paid: 100, method: "現金", delivery: "寄送", channel: "超商", freight: 60 }));
        const receipt = { requestId: crypto.randomUUID(), kind: "SALE", date: "2026-10-05", method: "現金", allocations: [{ orderId: orders[0].id, amount: 320 }] };
        expect((await savePayment(receipt)).success).toBe(true);
        expect((await savePayment(receipt)).success).toBe(true);
        expect(orders[0]).toMatchObject({ total: 420, paid: 420 });
        expect(payments).toHaveLength(2);
        expect(payments[1].allocations[0].remainingAfter).toBe(0);
        expect(cash.map(c => [c.category, c.amount])).toEqual([["零售-商品銷售", 100], ["零售-商品銷售", 260], ["運費收入", 60]]);
        expect(products[0].stock).toBe(8);
    });
    it("checks cash access before acquiring the only database connection", async () => {
        const transaction = mocks.db.$transaction;
        let inTransaction = false;
        mocks.db.$transaction = async (work: any) => { inTransaction = true; try { return await transaction(work); } finally { inTransaction = false; } };
        mocks.permission.mockImplementation(async () => { expect(inTransaction).toBe(false); return ctx.user; });
        mocks.feature.mockImplementation(async () => { expect(inTransaction).toBe(false); return true; });
        await saveInventoryOrder(ctx, input({ paid: 100, method: "現金" }));
        expect(orders[0].paid).toBe(100);
        expect(cash[0].amount).toBe(100);
    });
    it("posts an unpaid discounted sale without cash entries", async () => { await saveInventoryOrder(ctx, input()); expect(products[0].stock).toBe(8); expect(orders[0]).toMatchObject({ total: 360, paid: 0 }); expect(orders[0].lines[0].cost).toBe(200); expect(cash).toHaveLength(0); });
    it("preserves creation replay even after editing", async () => { const v = input(); const id = await saveInventoryOrder(ctx, v); await saveInventoryOrder(ctx, input({ id, revision: 1, lines: [{ ...v.lines[0], quantity: 3 }] })); expect(await saveInventoryOrder(ctx, v)).toBe(id); expect(orders).toHaveLength(1); expect(products[0].stock).toBe(7); });
    it("rejects altered payload using the same request key", async () => { const v = input(); await saveInventoryOrder(ctx, v); await expect(saveInventoryOrder(ctx, { ...v, freight: 20 })).rejects.toThrow(); expect(products[0].stock).toBe(8); });
    it("calculates average across multiple suppliers without posting unpaid cash", async () => { await saveInventoryOrder(ctx, input({ kind: "PURCHASE", partyId: "vendor-1", lines: [{ ...input().lines[0], quantity: 10, unitPrice: 200 }] })); await saveInventoryOrder(ctx, input({ kind: "PURCHASE", partyId: "vendor-2", lines: [{ ...input().lines[0], quantity: 10, unitPrice: 300 }] })); expect(products[0].stock).toBe(30); expect(Number(products[0].averageCost)).toBe(200); expect(orders.map(o => o.partyId)).toEqual(['vendor-1', 'vendor-2']); expect(cash).toHaveLength(0); });
    it("charges gift cost and excludes freight from goods profit", async () => { await saveInventoryOrder(ctx, input({ lines: [{ ...input().lines[0], gift: true }], delivery: "寄送", channel: "超商", freight: 60 })); expect(products[0].stock).toBe(8); expect(orders[0].total).toBe(60); const report = inventoryReport(orders.map(o => ({ ...o, date: '2026-10-05' })), '2026-10-01', '2026-10-10'); expect(report[0]).toMatchObject({ sold: 0, gifts: 2, total: 0, cost: 200, profit: -200, margin: null }); });
    it("allocates partial payment to goods then freight atomically", async () => { await saveInventoryOrder(ctx, input({ delivery: "寄送", channel: "貨運", freight: 60 })); const id = orders[0].id; await inventoryTransaction(ctx, tx => createInventoryPayment(ctx, tx, { requestId: crypto.randomUUID(), requestHash: 'hash', kind: 'SALE', date: new Date('2026-10-05'), method: '轉帳', allocations: [{ orderId: id, amount: 380 }] })); expect(cash.map(c => [c.category, c.amount])).toEqual([['零售-商品銷售', 360], ['運費收入', 20]]); expect(orders[0].paid).toBe(380); expect(payments[0].allocations[0].remainingAfter).toBe(40); });
    it("rolls back stock/order/payment if cash permission rejects", async () => { mocks.permission.mockRejectedValueOnce(Error('沒有收支權限')); await expect(saveInventoryOrder(ctx, input({ method: '現金', paid: 100 }))).rejects.toThrow(); expect(products[0].stock).toBe(10); expect(orders).toHaveLength(0); expect(payments).toHaveLength(0); expect(commands).toHaveLength(0); });
    it("rejects insufficient stock and stale revisions", async () => { await expect(saveInventoryOrder(ctx, input({ lines: [{ ...input().lines[0], quantity: 11 }] }))).rejects.toThrow('庫存不足'); const id = await saveInventoryOrder(ctx, input()); await expect(saveInventoryOrder(ctx, input({ id, revision: 99 }))).rejects.toThrow('單據已更新'); });
    it("does not permit cross-store product/customer IDs", async () => { products[0].storeId = 'other'; await expect(saveInventoryOrder(ctx, input())).rejects.toThrow(); expect(products[0].stock).toBe(10); });
    it("requires cost permission for purchase", async () => { await expect(saveInventoryOrder({ ...ctx, canCost: false }, input({ kind: 'PURCHASE', partyId: 'vendor-1' }))).rejects.toThrow('沒有查看成本'); });
    it("returns removed lines at their recorded cost after later purchases", async () => { const v = input(); const id = await saveInventoryOrder(ctx, v); await saveInventoryOrder(ctx, input({ kind: 'PURCHASE', partyId: 'vendor-1', lines: [{ ...v.lines[0], quantity: 8, unitPrice: 200 }] })); expect(Number(products[0].averageCost)).toBe(150); await saveInventoryOrder(ctx, input({ id, revision: 1, lines: [{ ...v.lines[0], quantity: 1 }] })); expect(products[0].stock).toBe(17); expect(Number(products[0].averageCost)).toBeCloseTo(2500 / 17, 6); });
    it("rejects overpayment without changes", async () => { await saveInventoryOrder(ctx, input()); await expect(inventoryTransaction(ctx, tx => createInventoryPayment(ctx, tx, { requestId: crypto.randomUUID(), requestHash: 'x', kind: 'SALE', date: new Date('2026-10-05'), method: '現金', allocations: [{ orderId: orders[0].id, amount: 361 }] }))).rejects.toThrow(); expect(orders[0].paid).toBe(0); expect(cash).toHaveLength(0); });
    it("removes cost keys from staff responses", () => { expect(publicLines([{ ...input().lines[0], name: 'A', cost: 100, total: 360 }], false)[0]).not.toHaveProperty('cost'); });
    it("rejects invalid dates and discount bounds", () => { expect(() => input({ date: '2026-02-30' })).toThrow(); expect(() => lineTotal({ ...input().lines[0], discount: 101 })).toThrow(); });
    it("hides and blocks exports when data export is disabled", async () => { mocks.db.storeFeatureEntitlement.findUnique.mockResolvedValue({ status: 'DISABLED' }); expect(await inventoryExportEnabled(ctx.storeId)).toBe(false); });
    it("blocks inventory without an explicit HQ grant", async () => { mocks.db.storeFeatureEntitlement.findUnique.mockResolvedValue(null); await expect(inventoryContext()).rejects.toThrow('尚未開通'); });
    it("records actor/date/count difference and replays without duplicate adjustment", async () => { const v = { requestId: crypto.randomUUID(), date: '2026-10-05', reason: '月末盤點', lines: [{ productId: 'a', revision: 1, actual: 8 }] }; expect((await saveStockCount(v)).success).toBe(true); expect((await saveStockCount(v)).success).toBe(true); expect(counts).toHaveLength(1); expect(counts[0]).toMatchObject({ actorName: '店長', actorId: 'user-1', date: new Date(v.date), lines: [{ productId: 'a', name: '商品 A', before: 10, actual: 8, difference: -2 }] }); expect(products[0].stock).toBe(8); expect(Number(products[0].averageCost)).toBe(100); });
    it("rejects a stale count after a sale", async () => { await saveInventoryOrder(ctx, input()); const r = await saveStockCount({ requestId: crypto.randomUUID(), date: '2026-10-05', reason: '月末盤點', lines: [{ productId: 'a', revision: 1, actual: 10 }] }); expect(r.success).toBe(false); expect(products[0].stock).toBe(8); expect(counts).toHaveLength(0); });
});
