import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { refundUnusedCoursePurchase } from "@/server/services/course-refund";
import type { Prisma } from "../../generated/course-client";
const order = { id: "order-a", status: "CONFIRMED", cardId: "card-a", price: 900, points: 10, name: "十點", refunds: [] };
const card = { id: "card-a", remaining: 10, closedAt: null, entries: [{ kind: "GRANT", points: 10 }] };
const actor = { storeId: "store-a", userId: "manager-a" };
const input = { purchaseId: "order-a", reason: "顧客申請", requestKey: "request-a" };
const tx = {
  coursePurchaseRefund: { findUnique: vi.fn(), create: vi.fn() },
  coursePurchase: { findFirst: vi.fn(), update: vi.fn() },
  coursePointCard: { findFirst: vi.fn(), update: vi.fn() },
  courseBooking: { count: vi.fn() },
  coursePointEntry: { create: vi.fn() }, $queryRaw: vi.fn(), $executeRaw: vi.fn(),
};
const run = () => refundUnusedCoursePurchase(tx as unknown as Prisma.TransactionClient, actor, input);
const negotiated = (overrides = {}) => refundUnusedCoursePurchase(tx as unknown as Prisma.TransactionClient, actor, {...input,amount:400,method:"BANK_TRANSFER",expectedRemaining:6,expectedRefundedAmount:0,...overrides} as Parameters<typeof refundUnusedCoursePurchase>[2]);
beforeEach(() => {
  vi.resetAllMocks();
  tx.coursePurchaseRefund.findUnique.mockResolvedValue(null);
  tx.coursePurchase.findFirst.mockResolvedValue(order);
  tx.coursePointCard.findFirst.mockResolvedValue(card);
  tx.courseBooking.count.mockResolvedValue(0);
  tx.$queryRaw.mockResolvedValue([{ amount: "900", type: "INCOME", paymentMethod: "OTHER" }]);
  tx.coursePurchaseRefund.create.mockImplementation(async ({ data }) => ({ id: "refund-a", ...data }));
});
describe("course unused refund", () => {
  it("registers an agreed refund after partial use without enforcing the reference formula",async()=>{
    tx.coursePointCard.findFirst.mockResolvedValue({...card,remaining:6});
    tx.courseBooking.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    const refund=await negotiated({amount:700});
    expect(refund).toMatchObject({amount:700,method:"BANK_TRANSFER",points:6});
    expect(tx.coursePointEntry.create).toHaveBeenCalledWith({data:expect.objectContaining({points:6,kind:"REFUND"})});
  });
  it("allows remaining negotiated money after card closure without retiring quota twice",async()=>{
    tx.coursePurchase.findFirst.mockResolvedValue({...order,status:"REFUNDED",refunds:[{amount:400}]});
    tx.coursePointCard.findFirst.mockResolvedValue({...card,remaining:0,closedAt:new Date()});
    expect((await negotiated({amount:500,expectedRemaining:0,expectedRefundedAmount:400})).amount).toBe(500);
    expect(tx.coursePointCard.update).not.toHaveBeenCalled();expect(tx.coursePointEntry.create).not.toHaveBeenCalled();
  });
  it.each([0,-1,0.5,501,NaN,Infinity])("blocks invalid or over-cap negotiated amount %s",async amount=>{
    tx.coursePurchase.findFirst.mockResolvedValue({...order,status:"REFUNDED",refunds:[{amount:400}]});
    tx.coursePointCard.findFirst.mockResolvedValue({...card,remaining:0,closedAt:new Date()});
    await expect(negotiated({amount,expectedRemaining:0,expectedRefundedAmount:400})).rejects.toThrow();
    expect(tx.coursePurchaseRefund.create).not.toHaveBeenCalled();
  });
  it("rejects stale quota confirmation before any mutation",async()=>{
    await expect(negotiated()).rejects.toThrow("已變動");expect(tx.coursePurchaseRefund.create).not.toHaveBeenCalled();
  });
  it("blocks held seats without cancelling any booking",async()=>{
    tx.coursePointCard.findFirst.mockResolvedValue({...card,remaining:6});tx.courseBooking.count.mockResolvedValueOnce(1);
    await expect(negotiated()).rejects.toThrow("預約占用");expect(tx.coursePurchaseRefund.create).not.toHaveBeenCalled();
  });
  it("requires an open drawer for cash and records an actual cash expense",async()=>{
    tx.coursePointCard.findFirst.mockResolvedValue({...card,remaining:6});
    tx.$queryRaw.mockResolvedValueOnce([{amount:900,type:"INCOME",paymentMethod:"OTHER"}]).mockResolvedValueOnce([{id:"drawer",status:"OPEN"}]);
    await negotiated({method:"CASH"});
    expect(tx.$executeRaw.mock.calls.some(call=>call.slice(1).includes("CASH"))).toBe(true);
    expect(tx.$executeRaw.mock.calls[0][0].join("")).toContain('UPDATE "CashDrawerSession"');
  });
  it("does not write a cash refund against a closed drawer",async()=>{
    tx.coursePointCard.findFirst.mockResolvedValue({...card,remaining:6});
    tx.$queryRaw.mockResolvedValueOnce([{amount:900,type:"INCOME",paymentMethod:"OTHER"}]).mockResolvedValueOnce([{id:"drawer",status:"CLOSED"}]);
    await expect(negotiated({method:"CASH"})).rejects.toThrow("現金抽屜");expect(tx.coursePurchaseRefund.create).not.toHaveBeenCalled();
  });
  it("replays the same amount and method, but rejects changed retry payloads",async()=>{
    tx.coursePurchaseRefund.findUnique.mockResolvedValue({...input,id:"refund-a",amount:400,method:"BANK_TRANSFER"});
    expect((await negotiated()).id).toBe("refund-a");
    await expect(negotiated({amount:500})).rejects.toThrow("退款請求已使用");
    await expect(negotiated({method:"CASH"})).rejects.toThrow("退款請求已使用");
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it("returns the actual paid amount and closes all purchased quota with a linked expense", async () => {
    const result = await run();
    expect(result.amount).toBe(900);
    expect(tx.coursePurchase.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "order-a", storeId: "store-a" } }));
    expect(tx.coursePointCard.update).toHaveBeenCalledWith({ where: { id: "card-a" }, data: { remaining: 0, closedAt: expect.any(Date) } });
    expect(tx.coursePointEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: "REFUND", points: 10, storeId: "store-a" }) });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });
  it("returns a matching retry without further writes", async () => {
    tx.coursePurchaseRefund.findUnique.mockResolvedValue({ id: "refund-a", ...input });
    expect((await run()).id).toBe("refund-a");
    expect(tx.coursePurchase.findFirst).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it("rejects a retry key reused for another reason", async () => {
    tx.coursePurchaseRefund.findUnique.mockResolvedValue({ ...input, reason: "不同" });
    await expect(run()).rejects.toThrow("退款請求已使用");
  });
  it.each([
    ["reserved (including checked-in)", () => tx.courseBooking.count.mockResolvedValueOnce(1)],
    ["partially used", () => tx.courseBooking.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1)],
    ["adjusted quota", () => tx.coursePointCard.findFirst.mockResolvedValue({ ...card, remaining: 11 })],
    ["extra gift grant", () => tx.coursePointCard.findFirst.mockResolvedValue({ ...card, entries: [...card.entries, { kind: "GRANT", points: 2 }] })],
    ["already refunded", () => tx.coursePurchase.findFirst.mockResolvedValue({ ...order, refunds: [{ id: "prior" }] })],
    ["unpaid order", () => tx.coursePurchase.findFirst.mockResolvedValue({ ...order, status: "PENDING" })],
    ["foreign store purchase", () => tx.coursePurchase.findFirst.mockResolvedValue(null)],
    ["mismatched receipt", () => tx.$queryRaw.mockResolvedValue([{ amount: 800, type: "INCOME", paymentMethod: "OTHER" }])],
  ])("rejects %s before refund writes", async (_label, prepare) => {
    prepare(); await expect(run()).rejects.toThrow();
    expect(tx.coursePurchaseRefund.create).not.toHaveBeenCalled();
    expect(tx.coursePointCard.update).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
