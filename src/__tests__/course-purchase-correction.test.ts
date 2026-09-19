import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { voidCoursePurchaseInTransaction, editCoursePurchaseInTransaction } from "@/server/services/course-purchase-correction";
import type { Prisma } from "../../generated/course-client";
const tx = { coursePurchase: { findFirst: vi.fn(), count: vi.fn(), update: vi.fn() }, coursePointCard: { findFirst: vi.fn(), update: vi.fn() }, coursePointEntry: { create: vi.fn() }, courseBooking: { count: vi.fn() }, $queryRaw: vi.fn(), $executeRaw: vi.fn() };
const db = tx as unknown as Prisma.TransactionClient;
const actor = { storeId: "store-a", userId: "user-a" };
const order = { id: "order-a", status: "CONFIRMED", cardId: "card-a", points: 10, price: 900, refunds: [], name: "方案", note: "", revenueStaffId: null };
const card = { id: "card-a", remaining: 10, closedAt: null, entries: [{ kind: "GRANT", points: 10 }] };
const input = { purchaseId: "order-a", reason: "誤建" };
beforeEach(() => { vi.resetAllMocks(); tx.coursePurchase.findFirst.mockResolvedValue(order); tx.coursePurchase.count.mockResolvedValue(1); tx.coursePointCard.findFirst.mockResolvedValue(card); tx.courseBooking.count.mockResolvedValue(0); tx.$queryRaw.mockResolvedValue([{ amount: 900, type: "INCOME", paymentMethod: "OTHER" }]); tx.coursePurchase.update.mockImplementation(async ({ data }) => ({ ...order, ...data })); });
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
    expect(tx.coursePointCard.update).not.toHaveBeenCalled(); expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
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
