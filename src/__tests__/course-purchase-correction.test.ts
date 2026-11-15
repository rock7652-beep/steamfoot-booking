import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const music=vi.hoisted(()=>({tuition:vi.fn(),receipts:vi.fn()}));
vi.mock("@/server/services/music-tuition",()=>({readMusicTuition:music.tuition,readMusicReceipts:music.receipts}));
import { voidCoursePurchaseInTransaction, editCoursePurchaseInTransaction } from "@/server/services/course-purchase-correction";
import type { Prisma } from "../../generated/course-client";
const tx = { coursePurchase: { findFirst: vi.fn(), count: vi.fn(), update: vi.fn() }, coursePointCard: { findFirst: vi.fn(), update: vi.fn() }, coursePointEntry: { create: vi.fn() }, courseBooking: { count: vi.fn() }, $queryRaw: vi.fn(), $executeRaw: vi.fn() };
const db = tx as unknown as Prisma.TransactionClient;
const actor = { storeId: "store-a", userId: "user-a" };
const order = { id: "order-a", status: "CONFIRMED", cardId: "card-a", points: 10, price: 900, refunds: [], name: "方案", note: "", revenueStaffId: null };
const card = { id: "card-a", remaining: 10, closedAt: null, entries: [{ kind: "GRANT", points: 10 }] };
const input = { purchaseId: "order-a", reason: "誤建" };
beforeEach(() => { vi.resetAllMocks(); music.tuition.mockResolvedValue(new Map()); music.receipts.mockResolvedValue([]); tx.coursePurchase.findFirst.mockResolvedValue(order); tx.coursePurchase.count.mockResolvedValue(1); tx.coursePointCard.findFirst.mockResolvedValue(card); tx.courseBooking.count.mockResolvedValue(0); tx.$queryRaw.mockResolvedValue([{ amount: 900, type: "INCOME", paymentMethod: "OTHER" }]); tx.coursePurchase.update.mockImplementation(async ({ data }) => ({ ...order, ...data })); });
describe("course transaction corrections", () => {
  it("voids only its card and records a noncash reversal without deleting history", async () => {
    expect((await voidCoursePurchaseInTransaction(db, actor, input)).status).toBe("VOIDED");
    expect(tx.coursePointCard.update).toHaveBeenCalledWith({ where: { id: "card-a" }, data: { remaining: 0, closedAt: expect.any(Date) } });
    expect(tx.coursePointEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: "VOID", points: 10, storeId: "store-a" }) });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });
  it("replaying the same void does not create another reversal", async () => {
    tx.coursePurchase.findFirst.mockResolvedValue({ ...order, status: "VOIDED", voidReason: "誤建" });
    await voidCoursePurchaseInTransaction(db, actor, input);
    expect(tx.coursePointCard.update).not.toHaveBeenCalled(); expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it.each([
    ["any booking history", () => tx.courseBooking.count.mockResolvedValue(1)],
    ["multiple purchase sources", () => tx.coursePurchase.count.mockResolvedValue(2)],
    ["used quota", () => tx.coursePointCard.findFirst.mockResolvedValue({ ...card, remaining: 7 })],
    ["gift or adjustment", () => tx.coursePointCard.findFirst.mockResolvedValue({ ...card, entries: [...card.entries, { kind: "GRANT", points: 1 }] })],
    ["refunded", () => tx.coursePurchase.findFirst.mockResolvedValue({ ...order, status: "REFUNDED" })],
    ["foreign purchase", () => tx.coursePurchase.findFirst.mockResolvedValue(null)],
  ])("rejects %s", async (_label, prepare) => { prepare(); await expect(voidCoursePurchaseInTransaction(db, actor, input)).rejects.toThrow(); expect(tx.coursePointCard.update).not.toHaveBeenCalled(); expect(tx.$executeRaw).not.toHaveBeenCalled(); });
  it("does not post a cash reversal for an unconfirmed order", async () => {
    tx.coursePurchase.findFirst.mockResolvedValue({ ...order, status: "PENDING", cardId: null });
    await voidCoursePurchaseInTransaction(db, actor, input);
    expect(tx.coursePointCard.update).not.toHaveBeenCalled(); expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw.mock.calls[0][0].join('')).toContain('"DigitalManagerNotice"');
    expect(tx.$executeRaw.mock.calls[0].slice(1)).toContain('course-purchase-pending:order-a');
  });
  it("rejects a staff attribution from another store before updating", async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await expect(editCoursePurchaseInTransaction(db, actor, { ...input, note: "測試", revenueStaffId: "foreign-staff" })).rejects.toThrow("本店");
    expect(tx.coursePurchase.update).not.toHaveBeenCalled();
  });
  it("edits only metadata and mirrors it to the linked receipt with an audit", async () => {
    await editCoursePurchaseInTransaction(db, actor, { ...input, note: "修正備註", revenueStaffId: null });
    expect(tx.coursePurchase.update).toHaveBeenCalledWith({ where: { id: "order-a" }, data: { note: "修正備註", revenueStaffId: null } });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2); expect(tx.coursePointCard.update).not.toHaveBeenCalled();
  });
});

it("voids a paid cash purchase on its closed original day without changing the drawer snapshot",async()=>{
  const day=new Date("2026-11-14T00:00:00Z");
  tx.coursePurchase.findFirst.mockResolvedValue({...order,paymentMethod:"CASH"});
  tx.$queryRaw.mockImplementation(async(parts:TemplateStringsArray)=>{
    const sql=parts.join("?");
    if(sql.includes('"CashDrawerSession"'))return [{id:"closed-drawer",status:"CLOSED"}];
    if(sql.includes('"CourseMusicTuition"'))return [];
    return [{amount:900,type:"INCOME",paymentMethod:"CASH",entryDate:day}];
  });
  expect((await voidCoursePurchaseInTransaction(db,actor,{purchaseId:order.id,reason:""})).status).toBe("VOIDED");
  expect(tx.$queryRaw.mock.calls.some(call=>call[0].join("?").includes('"CashDrawerSession"'))).toBe(true);
  expect(tx.$executeRaw.mock.calls.some(call=>call[0].join("?").includes('UPDATE "CashDrawerSession"'))).toBe(false);
  expect(tx.coursePurchase.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({voidReason:null})}));
  const reversal=tx.$executeRaw.mock.calls.find(call=>call[0].join("?").includes('INSERT INTO "CashbookEntry"'));
  expect(reversal?.[0].join("?")).toContain('SELECT');
  expect(reversal?.[0].join("?")).toContain('"entryDate"');
});
it("retries an already voided order with no reason without writing another reversal",async()=>{
  tx.coursePurchase.findFirst.mockResolvedValue({...order,status:"VOIDED",voidReason:null});
  await voidCoursePurchaseInTransaction(db,actor,{purchaseId:order.id,reason:""});
  expect(tx.coursePointCard.update).not.toHaveBeenCalled();expect(tx.$executeRaw).not.toHaveBeenCalled();
});

it("reverses every independent music receipt on its own original date without forcing a refund",async()=>{
 music.tuition.mockResolvedValue(new Map([[order.id,{due:1200}]]));
 music.receipts.mockResolvedValue([{id:'r1',amount:400,method:'CASH'},{id:'r2',amount:500,method:'BANK_TRANSFER'}]);
 const entries=[{id:'music-receipt:r1',amount:400,type:'INCOME',paymentMethod:'CASH',entryDate:new Date('2026-11-13T00:00:00Z')},{id:'music-receipt:r2',amount:500,type:'INCOME',paymentMethod:'OTHER',entryDate:new Date('2026-11-14T00:00:00Z')}];
 tx.$queryRaw.mockImplementation(async(parts:TemplateStringsArray)=>parts.join('?').includes('CashDrawerSession')?[{id:'closed',status:'CLOSED'}]:entries);
 await voidCoursePurchaseInTransaction(db,actor,{purchaseId:order.id,reason:''});
 const reversals=tx.$executeRaw.mock.calls.filter(call=>call[0].join('?').includes('INSERT INTO "CashbookEntry"'));
 expect(reversals).toHaveLength(2);
 expect(reversals.map(call=>call.slice(1).find(value=>typeof value==='string'&&value.startsWith('course-void:')))).toEqual(['course-void:order-a:music-receipt:r1','course-void:order-a:music-receipt:r2']);
 expect(tx.$executeRaw.mock.calls.some(call=>/DELETE|UPDATE "CourseMusicReceipt"|UPDATE "CashDrawerSession"/.test(call[0].join('?')))).toBe(false);
 expect(tx.coursePointCard.update).toHaveBeenCalledOnce();
});
it("rejects inconsistent independent music receipts without writing cash reversals",async()=>{
 music.tuition.mockResolvedValue(new Map([[order.id,{due:1200}]]));music.receipts.mockResolvedValue([{id:'r1',amount:800,method:'CASH'}]);
 await expect(voidCoursePurchaseInTransaction(db,actor,{purchaseId:order.id,reason:''})).rejects.toThrow('實收不一致');
 expect(tx.$executeRaw).not.toHaveBeenCalled();
});
