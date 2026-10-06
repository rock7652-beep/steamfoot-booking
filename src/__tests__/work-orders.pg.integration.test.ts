import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

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
import { saveOrder } from "@/server/actions/inventory";
import { saveWorkOrderAction,collectWorkOrderAction,changeWorkOrderStatusAction,loadWorkOrders } from "@/server/actions/work-orders";

import { computeCashbookCashMovementsForSession } from "@/server/services/cash-drawer";
import { checkInventoryAccounts } from "@/server/reconciliation/finance-checks";


const url = resolveBookingIntegrationTestDatabaseUrl(process.env);
const pg = url ? describe : describe.skip;
pg("work-order production paths — canonical inventory receipts", () => {
  const db = appDb as PrismaClient;
  const day = new Date("2099-01-05T00:00:00Z");
  let storeId: string, customerId: string, productId: string, sessionId: string;
  beforeEach(async () => {
    vi.restoreAllMocks();
    const prefix = `finance_${randomUUID()}`;
    const store = await db.store.create({ data: { name: prefix, slug: prefix, plan: "ALLIANCE" } });
    storeId = store.id;
    await db.storeFeatureEntitlement.create({ data: { storeId, featureKey: "inventory", status: "ENABLED" } });
    await db.storeFeatureEntitlement.create({data:{storeId,featureKey:"work_orders",status:"ENABLED"}});
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

  async function cash() {
    const session = await db.cashDrawerSession.findUniqueOrThrow({ where: { id: sessionId } });
    return computeCashbookCashMovementsForSession(session);
  }
  async function stock() { return (await db.inventoryProduct.findUniqueOrThrow({ where: { id: productId } })).stock; }
  async function assertAccounts() { expect((await checkInventoryAccounts(storeId))[0].status).toBe("pass"); }

  function job(extra={}) {return {requestId:randomUUID(),date:"2099-01-05",partyId:customerId,labor:800,details:{item:"吉他調整"},lines:[{productId,quantity:2,unitPrice:200,discountMode:"NONE",discount:0,gift:false}],...extra};}
  function pay(orderId:string,amount=1200,method="現金"){return {requestId:randomUUID(),orderId,amount,method,date:"2099-01-05"};}
  async function order(extra={}){const r=await saveWorkOrderAction(job(extra));expect(r.success).toBe(true);if(!r.success||!r.data)throw Error(JSON.stringify(r));return r.data;}
  it("concurrent opening replay creates one unpaid work order and deducts stock once",async()=>{
    const input=job();const results=await Promise.all([saveWorkOrderAction(input),saveWorkOrderAction(input)]);
    expect(results.every(r=>r.success)).toBe(true);expect(results[0]).toEqual(results[1]);expect(await stock()).toBe(8);
    const orders=await db.inventoryOrder.findMany({where:{storeId}});expect(orders).toHaveLength(1);expect(orders[0].total).toBe(1200);expect(orders[0].paid).toBe(0);expect(orders[0].workOrderNumber).toBe("990105001");
    expect(await db.cashbookEntry.count({where:{storeId}})).toBe(0);await assertAccounts();
  });
  it("daily numbering is concurrent-safe, resets tomorrow, survives editing and is searchable",async()=>{
    const results=await Promise.all(Array.from({length:3},()=>saveWorkOrderAction(job({lines:[]}))));
    expect(results.every(r=>r.success)).toBe(true);
    const rows=await db.inventoryOrder.findMany({where:{storeId},orderBy:{workOrderNumber:"asc"}});
    expect(rows.map(o=>o.workOrderNumber)).toEqual(["990105001","990105002","990105003"]);
    const tomorrow=await order({date:"2099-01-06",lines:[]});
    expect((await db.inventoryOrder.findUniqueOrThrow({where:{id:tomorrow}})).workOrderNumber).toBe("990106001");
    expect((await saveWorkOrderAction(job({id:rows[0].id,revision:1,date:"2099-01-07",lines:[]}))).success).toBe(true);
    const found=await loadWorkOrders({query:"990105001"});expect(found.success).toBe(true);if(found.success){expect(found.data.orders).toHaveLength(1);expect(found.data.orders[0].id).toBe(rows[0].id);expect(found.data.orders[0].date).toBe("2099-01-07");}
    expect((await saveWorkOrderAction(job({lines:[{...job().lines[0],quantity:100}]}))).success).toBe(false);
    const next=await order({lines:[]});expect((await db.inventoryOrder.findUniqueOrThrow({where:{id:next}})).workOrderNumber).toBe("990105004");
  });
  it("material identity prices, discounts and gifts share the canonical totals and stock",async()=>{
    await db.inventoryProduct.update({where:{id:productId},data:{details:{priceRatios:{STUDENT:80}}}});
    const id=await order({labor:50,priceCategory:"STUDENT",lines:[{...job().lines[0],unitPrice:160,discountMode:"PERCENT",discount:10}]});
    const saved=await db.inventoryOrder.findUniqueOrThrow({where:{id}});expect(saved.total).toBe(338);expect(saved.paid).toBe(0);expect(saved.priceCategory).toBe("STUDENT");expect(await stock()).toBe(8);
    const gift=await order({labor:0,lines:[{...job().lines[0],quantity:1,gift:true}]});expect((await db.inventoryOrder.findUniqueOrThrow({where:{id:gift}})).total).toBe(0);expect(await stock()).toBe(7);
    expect((await collectWorkOrderAction(pay(id,338,"轉帳"))).success).toBe(true);expect(await stock()).toBe(7);await assertAccounts();
  });
  it("labor-only works with inventory disabled and has no shop fee cap",async()=>{
    await db.storeFeatureEntitlement.updateMany({where:{storeId,featureKey:"inventory"},data:{status:"LOCKED"}});
    const id=await order({lines:[],labor:100000001});const r=await collectWorkOrderAction(pay(id,100000001,"轉帳"));expect(r.success).toBe(true);
    expect(await stock()).toBe(10);expect((await cash()).cashbookCashIncome.toNumber()).toBe(0);expect(await db.cashbookEntry.count({where:{storeId,category:"工單收入"}})).toBe(1);await assertAccounts();
  });
  it("20 identical cash receipts produce one receipt and ledger, with unchanged stock",async()=>{
    const id=await order(),input=pay(id);const results=await Promise.all(Array.from({length:20},()=>collectWorkOrderAction(input)));
    expect(results.every(r=>r.success)).toBe(true);expect(new Set(results.map(r=>r.success?r.data:"failed")).size).toBe(1);
    expect(await db.inventoryPayment.count({where:{storeId}})).toBe(1);expect(await db.cashbookEntry.count({where:{storeId}})).toBe(1);
    expect(await stock()).toBe(8);expect((await cash()).cashbookCashIncome.toNumber()).toBe(1200);await assertAccounts();
  });
  it("independent concurrent receipts cannot overcollect",async()=>{const id=await order();const r=await Promise.all([collectWorkOrderAction(pay(id,800)),collectWorkOrderAction(pay(id,800))]);expect(r.filter(r=>r.success)).toHaveLength(1);expect((await db.inventoryOrder.findUniqueOrThrow({where:{id}})).paid).toBe(800);await assertAccounts();});
  it("partial cash and final transfer reconcile without a second stock deduction",async()=>{
    const id=await order();
    expect((await collectWorkOrderAction(pay(id,400))).success).toBe(true);
    expect((await db.inventoryOrder.findUniqueOrThrow({where:{id}})).paid).toBe(400);
    expect((await collectWorkOrderAction(pay(id,800,"轉帳"))).success).toBe(true);
    const saved=await db.inventoryOrder.findUniqueOrThrow({where:{id}});
    expect(saved.total-saved.paid).toBe(0);expect(await stock()).toBe(8);
    expect((await cash()).cashbookCashIncome.toNumber()).toBe(400);
    const entries=await db.cashbookEntry.findMany({where:{storeId}});
    expect(entries).toHaveLength(2);expect(entries.every(e=>e.category==="工單收入")).toBe(true);
    expect(entries.reduce((sum,e)=>sum+Number(e.amount),0)).toBe(1200);await assertAccounts();
  });
  it("material edits apply only their stock difference and reject reducing below money collected atomically",async()=>{
    const id=await order();
    expect((await saveWorkOrderAction(job({id,revision:1,lines:[{...job().lines[0],quantity:1}]}))).success).toBe(true);
    expect(await stock()).toBe(9);
    expect((await collectWorkOrderAction(pay(id,1000,"轉帳"))).success).toBe(true);
    const before=await db.inventoryOrder.findUniqueOrThrow({where:{id}});
    expect((await saveWorkOrderAction(job({id,revision:before.revision,labor:0,lines:[]}))).success).toBe(false);
    const after=await db.inventoryOrder.findUniqueOrThrow({where:{id}});
    expect(after.total).toBe(1000);expect(after.paid).toBe(1000);expect(after.revision).toBe(before.revision);
    expect(await stock()).toBe(9);await assertAccounts();
  });
  it("status changes are version guarded and do not imply payment or alter stock",async()=>{
    const id=await order();const input={requestId:randomUUID(),id,revision:1,status:"COLLECTED"};const r=await changeWorkOrderStatusAction(input);expect(r.success).toBe(true);expect(await changeWorkOrderStatusAction(input)).toEqual(r);
    const saved=await db.inventoryOrder.findUniqueOrThrow({where:{id}});expect(saved.paid).toBe(0);expect(await stock()).toBe(8);
    const view=await loadWorkOrders({});expect(view.success).toBe(true);if(view.success)expect(view.data.orders[0].workOrder.status).toBe("COLLECTED");
    expect((await changeWorkOrderStatusAction({...input,requestId:randomUUID(),status:"READY"})).success).toBe(false);await assertAccounts();
  });
  it("direct sales editor cannot change linked work orders",async()=>{
    const id=await order();const r=await saveOrder({requestId:randomUUID(),id,revision:1,kind:"SALE",date:"2099-01-05",partyId:customerId,paid:0,method:"未付款",lines:job().lines});expect(r.success).toBe(false);expect(await stock()).toBe(8);
  });
  it("closed-day cash fails atomically while bank receipts remain valid",async()=>{
    const id=await order();await db.cashDrawerSession.update({where:{id:sessionId},data:{status:"CLOSED",closedAt:new Date(),closedByUserId:boundary.actor.id}});
    expect((await collectWorkOrderAction(pay(id))).success).toBe(false);expect((await db.inventoryOrder.findUniqueOrThrow({where:{id}})).paid).toBe(0);expect(await db.inventoryPayment.count({where:{storeId}})).toBe(0);expect((await collectWorkOrderAction(pay(id,1200,"轉帳"))).success).toBe(true);await assertAccounts();
  });
  it("HQ disabled work-order entitlement blocks both writes and receipts",async()=>{const id=await order();await db.storeFeatureEntitlement.updateMany({where:{storeId,featureKey:"work_orders"},data:{status:"HIDDEN"}});expect((await saveWorkOrderAction(job())).success).toBe(false);expect((await collectWorkOrderAction(pay(id))).success).toBe(false);expect(await stock()).toBe(8);await assertAccounts();});
});
