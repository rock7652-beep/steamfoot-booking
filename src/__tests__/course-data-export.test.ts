import { courseCardActiveExpiryWhere } from "@/lib/course-card-expiry";
import { syntheticOpeningCard, syntheticOpeningRecord } from "./fixtures/music-opening";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ trials:vi.fn(), staff:vi.fn(), customers: vi.fn(), cards: vi.fn(), bookings: vi.fn(), orders: vi.fn(), refunds: vi.fn(), visits: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { staff:{findMany:m.staff}, customer: { findMany: m.customers } } }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { courseTrialPayment:{findMany:m.trials}, coursePointCard: { findMany: m.cards }, courseBooking: { findMany: m.bookings }, coursePurchase: { findMany: m.orders }, coursePurchaseRefund: { findMany: m.refunds }, $queryRaw: m.visits } }));
import { getCourseDataExport } from "@/server/queries/course-data-export";
const now = new Date("2026-09-17T12:00:00Z"), period = { gte: new Date("2026-09-01T00:00:00+08:00"), lte: now };
beforeEach(() => { vi.resetAllMocks();m.trials.mockResolvedValue([]);m.staff.mockResolvedValue([{userId:"manager-user"}]); m.customers.mockResolvedValue([{ id: "a", name: "A" }, { id: "b", name: "B" }]); m.orders.mockResolvedValue([]); m.refunds.mockResolvedValue([]); });
it("exports one row per shared card with reserved quota and separate unit/expiry", async () => {
  m.cards.mockResolvedValue([{ id: "card", nameSnapshot: "共卡", remaining: 10, closedAt: null, expiresAt: new Date("2026-10-01"), createdAt: now, unit: "SESSION", members: [{ customerId: "a" }, { customerId: "b" }], bookings: [{ pointCost: 3 }] }]);
  const [sheet] = await getCourseDataExport("own", "wallets", period, "ACTIVE", 100, { now });
  expect(sheet.rows).toHaveLength(1); expect(sheet.rows[0].slice(0, 7)).toEqual(["card", "共卡", "A、B", 10, 3, 7, "堂"]);
  expect(m.cards).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "own", createdAt: period, closedAt: null, ...courseCardActiveExpiryWhere(now) }, take: 101 }));
  expect(m.customers).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "own", id: { in: ["a", "b"] } } }));
});
it("keeps purchase dates separate from refund dates and applies manager visibility to both", async () => {
  m.orders.mockResolvedValue([{ id: "o", customerId: "a", name: "課程卡", price: 1000, status: "REFUNDED", createdAt: now, confirmedAt: now, refunds: [{ amount: 400 }, { amount: 200 }] }]);
  m.refunds.mockResolvedValue([{ id: "r", purchaseId: "o", amount: 200, method: "BANK_TRANSFER", reason: "協商", createdAt: now, purchase: { customerId: "a", name: "課程卡" } }]);
  const sheets = await getCourseDataExport("own", "transactions", period, "REFUNDED", 100, { revenueStaffId: "manager" });
  expect(sheets).toHaveLength(3); expect(sheets.find(s=>s.name==="購買登錄")!.rows[0][7]).toBe(600); expect(sheets.find(s=>s.name==="退款發生")!.rows[0][5]).toBe(200);
  expect(m.orders).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "own", createdAt: period, status: "REFUNDED", revenueStaffId: "manager" } }));
  expect(m.refunds).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "own", createdAt: period, purchase: { status: "REFUNDED", revenueStaffId: "manager" } } }));
});
it("exports actual learner, operator and class-date filter without counting booking rows as people", async () => {
  m.bookings.mockResolvedValue([{ customerId: "b", operatorCustomerId: "a", customerName: "B", operatorName: "A", pointCost: 3, status: "RESERVED", checkedInAt: now, session: { startsAt: now, nameSnapshot: "核心", cancelledAt: null }, card: { nameSnapshot: "十點", expiresAt: now, unit: "POINT" } }]);
  const [sheet] = await getCourseDataExport("own", "bookings", period, "RESERVED", 100);
  expect(sheet.rows[0].slice(2, 6)).toEqual(["B", "A", "代約", "十點"]);
  expect(sheet.rows[0][9]).toBe("待上課／已報到");
  expect(m.bookings).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "own", session: { startsAt: period }, status: "RESERVED" } }));
});
it("uses course attendance for first/last visit and excludes archived customer rows", async () => {
  m.customers.mockResolvedValue([{ id: "a", name: "A", phone: "SYNTHETIC-NON-CONTACT", email: null, createdAt: now, assignedStaff: null }]);
  m.visits.mockResolvedValue([{ customerId: "a", first: now, last: now }]);
  const [sheet] = await getCourseDataExport("own", "customers", period, undefined, 100);
  expect(sheet.rows[0][4]).toBeTruthy();
  expect(m.customers).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "own", mergedIntoCustomerId: null, createdAt: period } }));
  const sql = m.visits.mock.calls[0][0].join("?");
  expect(sql).toContain('"CourseBooking"'); expect(sql).toContain("b.status='ATTENDED'");
});

it("exports explicit unlimited and unknown states separately", async () => {
  const record=syntheticOpeningRecord();record.expiresAt=null;record.expiryVerification={kind:"NO_EXPIRY",evidenceKey:"synthetic-proof"};
  const card={...syntheticOpeningCard(record),expiresAt:null,musicValidityDays:null,bookings:[]};
  m.cards.mockResolvedValue([card,{...card,id:"synthetic-corrupt",musicOpeningState:null}]);
  const [sheet]=await getCourseDataExport(card.storeId,"wallets",period,undefined,100,{now:new Date("2026-10-08")});
  expect(sheet.rows[0][5]).toBe(2);expect(sheet.rows[0][7]).toBe("無期限");
  expect(sheet.rows[1][5]).toBe(0);expect(sheet.rows[1][7]).toBe("效期待核對");expect(sheet.rows[1][8]).toBe("待核對");
});
