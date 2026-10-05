/* eslint-disable @typescript-eslint/no-explicit-any -- In-memory transaction adapter for acceptance scenarios. */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ db: {} as Record<string, any>, permission: vi.fn(), check:vi.fn<(role:string,staffId:string|null,code:string)=>Promise<boolean>>(async()=>true), feature: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: mocks.db }));
vi.mock("@/lib/permissions", () => ({ requirePermission: mocks.permission, checkPermission: mocks.check }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: vi.fn(async () => "store-1"), resolveWriteStoreId: vi.fn(async () => "store-1") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: mocks.feature }));
vi.mock("@/lib/data-export-gate", () => ({ hasDataExportFeature: vi.fn(async () => true) }));
vi.mock("@/server/services/operation-audit", () => ({ recordOperationAudit: mocks.audit }));
import { inventoryData, inventoryDocumentData, saveInventoryOrder, createInventoryPayment, inventoryTransaction, inventoryContext, inventoryExportEnabled, assertInventoryPreviewIsolation } from "./inventory";
import { receiveInventory, completeReceiving } from "./inventory-receiving";
import { saveProduct, saveStockCount, savePayment } from "@/server/actions/inventory";
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
let products: any[], orders: any[], commands: any[], payments: any[], cash: any[], counts: any[], receivings: any[], sequence: number;
const matches = (row: any, where: any) => Object.entries(where).every(([k, v]) => typeof v === 'object' && v !== null ? true : row[k] === v);
function apply(row: any, data: any) { for (const [k, v] of Object.entries(data))
    row[k] = v && typeof v === 'object' && 'increment' in v ? row[k] + (v as any).increment : v; return row; }
beforeEach(() => {
    sequence = 0;
    mocks.check.mockResolvedValue(true);
    products = [{ id: "a", storeId: ctx.storeId, name: "商品 A", stock: 10, averageCost: new Prisma.Decimal(100), price: 200, revision: 1, active: true }];
    orders = [];
    commands = [];
    payments = [];
    cash = [];
    counts = [];
    receivings = [];
    mocks.db.inventoryReceiving = { findFirst: async ({where}:any)=>receivings.find(r=>matches(r,where)), create:async ({data}:any)=>{const r={revision:1,orderId:null,...data};receivings.push(r);return r;},update:async ({where,data}:any)=>apply(receivings.find(r=>r.id===where.id),data) };
    mocks.permission.mockResolvedValue(ctx.user);
    mocks.feature.mockResolvedValue(true);
    mocks.audit.mockResolvedValue({});
    mocks.db.$queryRaw = vi.fn(async () => [{ id: ctx.storeId }]);
    mocks.db.storeFeatureEntitlement = { findUnique: vi.fn(async () => ({ status: 'ENABLED', startsAt: null, expiresAt: null })) };
    mocks.db.inventoryStockCount = { findUnique: async ({ where }: any) => counts.find(c => matches(c, where.storeId_requestId)), create: async ({ data }: any) => { const c = { id: `count-${++sequence}`, ...data }; counts.push(c); return c; } };
    mocks.db.inventoryProduct = { findFirst: async ({ where }: any) => products.find(p => matches(p, where)), findFirstOrThrow: async ({ where }: any) => { const p = products.find(p => matches(p, where)); if (!p)
            throw Error('not found'); return p; }, update: async ({ where, data }: any) => apply(products.find(p => p.id === where.id), data) };
    mocks.db.inventoryOrder = { findMany:async ({where}:any)=>orders.filter(o=>matches(o,where)), findFirst: async ({ where }: any) => orders.find(o => matches(o, where)), create: async ({ data }: any) => { const o = { id: `order-${++sequence}`, paid: 0, revision: 1, ...data }; orders.push(o); return o; }, update: async ({ where, data }: any) => apply(orders.find(o => o.id === where.id), data) };
    mocks.db.inventoryCommand = { findUnique: async ({ where }: any) => commands.find(c => matches(c, where.storeId_requestId)), create: async ({ data }: any) => { commands.push(data); return data; } };
    mocks.db.customer = { findFirst: async ({ where }: any) => where.id === 'customer-1' && where.storeId === ctx.storeId ? { id: where.id, name: "顧客", phone: "0912345678" } : null };
    mocks.db.inventorySupplier = { findFirst: async ({ where }: any) => ['vendor-1', 'vendor-2'].includes(where.id) && where.storeId === ctx.storeId ? { id: where.id, name: where.id, phone: "0222222222" } : null };
    mocks.db.inventoryPayment = { findUnique: async ({ where }: any) => payments.find(p => matches(p, where.storeId_requestId)), create: async ({ data }: any) => { const p = { id: `payment-${++sequence}`, ...data }; payments.push(p); return p; } };
    mocks.db.cashbookEntry = { create: async ({ data }: any) => { cash.push(data); return data; } };
    mocks.db.cashDrawerSession = { findFirst: vi.fn(async () => null) };
    mocks.db.$transaction = async (fn: any) => { const snapshot = { products: products.map(p => ({ ...p })), orders: orders.map(o => ({ ...o })), commands: [...commands], payments: [...payments], cash: [...cash], counts: [...counts],receivings:receivings.map(r=>({...r})) }; try {
        return await fn(mocks.db);
    }
    catch (e) {
        ({ products, orders, commands, payments, cash, counts, receivings } = snapshot);
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

describe("staff receiving and pending costs",()=>{
 const receiving=(overrides:any={})=>({requestId:crypto.randomUUID(),date:"2026-10-05",lines:[{productId:"a",expected:10,quantity:6}],...overrides});
 it("receives two batches once, then fills supplier and costs without duplicating stock",async()=>{
  const first=receiving();const id=await receiveInventory(first);await receiveInventory(first);
  expect(products[0].stock).toBe(16);expect(orders).toHaveLength(0);
  await receiveInventory(receiving({id,revision:1,lines:[{productId:"a",expected:10,quantity:4}]}));
  expect(products[0].stock).toBe(20);
  const confirm={requestId:crypto.randomUUID(),id,revision:2,supplierId:"vendor-1",lines:[{productId:"a",unitCost:120}]};
  await completeReceiving(confirm);await completeReceiving(confirm);
  expect(products[0].stock).toBe(20);expect(Number(products[0].averageCost)).toBe(110);
  expect(orders).toHaveLength(1);expect(orders[0].total).toBe(1200);expect(cash).toHaveLength(0);
 });
 it("marks sales costs pending and backfills weighted cost after supplier confirmation",async()=>{
  const id=await receiveInventory(receiving({lines:[{productId:"a",expected:10,quantity:10}]}));
  await saveInventoryOrder(ctx,input({lines:[{...input().lines[0],quantity:4}]}));
  expect(orders[0].lines[0].pendingCostShares[id]).toBe(2);
  expect(inventoryReport(orders.map(o=>({...o,date:"2026-10-05"})),"2026-10-01","2026-10-31")[0].costPending).toBe(true);
  await completeReceiving({requestId:crypto.randomUUID(),id,revision:1,supplierId:"vendor-1",lines:[{productId:"a",unitCost:120}]});
  expect(products[0].stock).toBe(16);expect(Number(products[0].averageCost)).toBe(110);
  expect(orders[0].lines[0].cost).toBe(440);expect(orders[0].lines[0].pendingCostShares).toEqual({});
 });
 it("allows confirmed zero cost but rejects cost completion before all goods arrive",async()=>{
  const id=await receiveInventory(receiving());
  await expect(completeReceiving({requestId:crypto.randomUUID(),id,revision:1,supplierId:"vendor-1",lines:[{productId:"a",unitCost:0}]})).rejects.toThrow("分批");
  expect(orders).toHaveLength(0);
  await receiveInventory(receiving({id,revision:1,lines:[{productId:"a",expected:10,quantity:4}]}));
  await completeReceiving({requestId:crypto.randomUUID(),id,revision:2,supplierId:"vendor-1",lines:[{productId:"a",unitCost:0}]});
  expect(receivings[0].lines[0].unitCost).toBe(0);expect(Number(products[0].averageCost)).toBe(50);
 });
 it("denies staff receipt writes without the receiving permission",async()=>{
  mocks.permission.mockImplementation(async(code:string)=>{if(code==="inventory.receive")throw new Error("forbidden");return ctx.user;});
  await expect(receiveInventory(receiving())).rejects.toThrow("forbidden");
  expect(products[0].stock).toBe(10);
 });
});
describe("receiving corrections and permission boundaries",()=>{
 it("rolls back every line when a later receiving item is invalid",async()=>{
  await expect(receiveInventory({requestId:crypto.randomUUID(),date:"2026-10-05",lines:[{productId:"a",expected:2,quantity:2},{productId:"missing",expected:1,quantity:1}]})).rejects.toThrow("商品");
  expect(products[0].stock).toBe(10);expect(receivings).toHaveLength(0);
 });
 it("requires a reason for negative corrections and preserves the revision on failure",async()=>{
  const id=await receiveInventory({requestId:crypto.randomUUID(),date:"2026-10-05",lines:[{productId:"a",expected:5,quantity:5}]});
  const correction={requestId:crypto.randomUUID(),id,revision:1,date:"2026-10-05",lines:[{productId:"a",expected:5,quantity:-1}]};
  await expect(receiveInventory(correction)).rejects.toThrow("原因");
  expect(products[0].stock).toBe(15);
  await receiveInventory({...correction,note:"實收核對為四件"});
  expect(products[0].stock).toBe(14);expect(receivings[0].lines[0].received).toBe(4);
 });
 it("denies purchase payment when only purchase management is granted",async()=>{
  const id=await saveInventoryOrder(ctx,input({kind:"PURCHASE",partyId:"vendor-1",lines:[{...input().lines[0],unitPrice:100,discountMode:"NONE",discount:0}]}));
  mocks.permission.mockImplementation(async(code:string)=>{if(code==="inventory.purchase.pay")throw new Error("forbidden");return ctx.user;});
  expect((await savePayment({requestId:crypto.randomUUID(),kind:"PURCHASE",date:"2026-10-05",method:"現金",allocations:[{orderId:id,amount:200}]})).success).toBe(false);
  expect(payments).toHaveLength(0);expect(cash).toHaveLength(0);expect(orders[0].paid).toBe(0);
 });
});

describe("identity pricing authorization and snapshots",()=>{
 it("defaults every new order to general pricing",()=>{expect(input().priceCategory).toBe("GENERAL");});
 it("allows configured faculty price without override permission and rounds unit price before quantity",async()=>{
  mocks.check.mockResolvedValue(false);products[0].price=199;products[0].details={priceRatios:{FACULTY:80}};
  const id=await saveInventoryOrder(ctx,input({priceCategory:"FACULTY",lines:[{productId:"a",quantity:3,unitPrice:159,discountMode:"NONE",discount:0,gift:false}]}));
  expect(orders.find(o=>o.id===id).total).toBe(477);expect(orders[0].priceCategory).toBe("FACULTY");
 });
 it("rejects a forged identity price or additional discount without stock movement",async()=>{
  mocks.check.mockResolvedValue(false);products[0].details={priceRatios:{STUDENT:80}};
  await expect(saveInventoryOrder(ctx,input({priceCategory:"STUDENT",lines:[{productId:"a",quantity:1,unitPrice:1,discountMode:"NONE",discount:0,gift:false}]}))).rejects.toThrow("單價與優惠");
  await expect(saveInventoryOrder(ctx,input({priceCategory:"STUDENT",lines:[{productId:"a",quantity:1,unitPrice:160,discountMode:"PERCENT",discount:10,gift:false}]}))).rejects.toThrow("單價與優惠");expect(products[0].stock).toBe(10);expect(orders).toHaveLength(0);
 });
 it("falls back to the general price when the selected ratio is unset",async()=>{
  mocks.check.mockResolvedValue(false);
  await saveInventoryOrder(ctx,input({priceCategory:"CONTRACT",lines:[{productId:"a",quantity:1,unitPrice:200,discountMode:"NONE",discount:0,gift:false}]}));expect(orders[0].total).toBe(200);
 });
 it("keeps old order pricing and product labels after product changes",async()=>{
  products[0].details={brand:"原品牌",priceRatios:{STUDENT:80}};
  const id=await saveInventoryOrder(ctx,input({priceCategory:"STUDENT",lines:[{productId:"a",quantity:1,unitPrice:160,discountMode:"NONE",discount:0,gift:false}]}));
  products[0].price=400;products[0].name="新名稱";products[0].details={brand:"新品牌",priceRatios:{STUDENT:50}};mocks.check.mockResolvedValue(false);
  await saveInventoryOrder(ctx,input({id,revision:1,priceCategory:"STUDENT",lines:[{productId:"a",quantity:2,unitPrice:160,discountMode:"NONE",discount:0,gift:false}]}));
  expect(orders[0].total).toBe(320);expect(orders[0].lines[0].name).toBe("商品 A");expect(orders[0].lines[0].brand).toBe("原品牌");
 });
});

describe("product metadata permissions",()=>{
 it("edits metadata without cost permission and preserves stock valuation",async()=>{
  mocks.check.mockResolvedValue(false);
  const result=await saveProduct({id:"a",revision:1,name:"商品新名稱",price:200,details:{brand:"品牌乙",unit:"盒",minimumStock:5}});
  expect(result.success).toBe(true);expect(products[0].details.brand).toBe("品牌乙");expect(products[0].stock).toBe(10);expect(Number(products[0].averageCost)).toBe(100);
 });
 it("requires separate permission to change identity ratios",async()=>{
  mocks.check.mockImplementation(async(_role:string,_staffId:string|null,code:string)=>code!=="inventory.price.manage");
  const result=await saveProduct({id:"a",revision:1,name:"商品 A",price:200,details:{priceRatios:{FACULTY:70}}});
  expect(result.success).toBe(false);expect(products[0].revision).toBe(1);
 });
});

describe("direct print document isolation",()=>{
 it("reads one sale in the current store and strips cost and internal notes",async()=>{
  mocks.db.store={findUniqueOrThrow:vi.fn(async()=>({id:ctx.storeId,name:"門市",shopConfig:null}))};
  const id=await saveInventoryOrder(ctx,input({internalNote:"內部秘密"}));
  const result=await inventoryDocumentData(ctx,"sale",id);expect(result.orders).toHaveLength(1);expect(result.orders[0].lines[0]).not.toHaveProperty("cost");expect(result.orders[0].internalNote).toBe("");
  const other=await inventoryDocumentData({...ctx,storeId:"other"},"sale",id);expect(other.orders).toEqual([]);
 });
});

it("rejects supplier payment when cost access is missing even if payment permission is granted",async()=>{
 mocks.check.mockResolvedValue(false);const result=await savePayment({requestId:crypto.randomUUID(),kind:"PURCHASE",date:"2026-10-05",method:"現金",allocations:[{orderId:"unknown",amount:1}]});expect(result.success).toBe(false);expect(result.error).toContain("成本");expect(payments).toHaveLength(0);
});

it("settles the 1120 wholesale scenario once without changing stock again",async()=>{
 products[0].stock=20;products[0].details={priceRatios:{WHOLESALE:70}};mocks.check.mockResolvedValue(false);
 const id=await saveInventoryOrder({...ctx,canCost:false},input({priceCategory:"WHOLESALE",lines:[{productId:"a",quantity:8,unitPrice:140,discountMode:"NONE",discount:0,gift:false}],delivery:"寄送",channel:"蝦皮"}));
 expect(orders[0]).toMatchObject({total:1120,paid:0});expect(products[0].stock).toBe(12);
 const receipt={requestId:crypto.randomUUID(),kind:"SALE",date:"2026-10-05",method:"現金",allocations:[{orderId:id,amount:1120}]};
 expect((await savePayment(receipt)).success).toBe(true);expect((await savePayment(receipt)).success).toBe(true);
 expect(orders[0].paid).toBe(1120);expect(payments).toHaveLength(1);expect(payments[0].allocations[0].remainingAfter).toBe(0);expect(cash).toHaveLength(1);expect(cash[0]).toMatchObject({amount:1120,type:"INCOME",paymentMethod:"CASH",category:"零售-商品銷售"});expect(products[0].stock).toBe(12);
 expect((await savePayment({...receipt,requestId:crypto.randomUUID()})).success).toBe(false);expect((await savePayment({...receipt,method:"轉帳"})).success).toBe(false);expect(cash).toHaveLength(1);
});
it("strips product and sale costs and suppresses supplier financial data for receiving staff",async()=>{
 await saveInventoryOrder(ctx,input());await saveInventoryOrder(ctx,input({kind:"PURCHASE",partyId:"vendor-1",lines:[{productId:"a",quantity:1,unitPrice:100,discountMode:"NONE",discount:0,gift:false}]}));
 mocks.check.mockImplementation(async(_role:string,_staffId:string|null,code:string)=>["inventory.read","inventory.receive","inventory.write"].includes(code));
 mocks.db.store={findUniqueOrThrow:vi.fn(async()=>({id:ctx.storeId,name:"測試店",shopConfig:null}))};
 mocks.db.inventoryProduct.findMany=vi.fn(async()=>products);mocks.db.inventorySupplier.findMany=vi.fn(async()=>[]);mocks.db.inventoryPayment.findMany=vi.fn(async()=>[]);mocks.db.inventoryStockCount.findMany=vi.fn(async()=>[]);mocks.db.customer.findMany=vi.fn(async()=>[]);mocks.db.user={findMany:vi.fn(async()=>[])};
 mocks.db.inventoryReceiving.findMany=vi.fn(async()=>[{id:"receiving",date:new Date("2026-10-05"),lines:[{productId:"a",unitCost:100}],history:[]}]);
 const data=await inventoryData({...ctx,canCost:false});
 expect(data.products[0]).not.toHaveProperty("averageCost");expect(data.products[0]).not.toHaveProperty("costPending");expect(data.orders).toHaveLength(1);expect(data.orders[0].kind).toBe("SALE");expect(data.orders[0].lines[0]).not.toHaveProperty("cost");expect(data.receivings?.[0].lines[0].unitCost).toBeNull();expect(data.canPurchasePay).toBe(false);expect(data.canReceive).toBe(true);
});
