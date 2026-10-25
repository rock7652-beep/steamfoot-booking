import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ bookings: vi.fn(), coupons: vi.fn(), sessions: vi.fn(), cards: vi.fn() }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { courseBooking: { findMany: m.bookings }, coursePointCard: { findMany: m.coupons }, courseSession: { findMany: m.sessions } } }));
vi.mock("@/server/queries/course-members", () => ({ getCourseCards: m.cards }));
import { getMusicLeaveWorkspace } from "@/server/queries/music-leave-workspace";
const leaf = { id: "leave", customerId: "student", cardId: "ordinary", card: { id: "ordinary", requestKey: "yjy-pilot-card:test" }, session: { id: "original", startsAt: new Date("2026-10-01T02:00Z"), templateId: "guitar", nameSnapshot: "Guitar", template: { classType: "PRIVATE" } } };
beforeEach(() => {
  vi.resetAllMocks(); m.bookings.mockResolvedValueOnce([leaf]).mockResolvedValue([]);
  m.coupons.mockResolvedValue([{ id: "coupon", requestKey: "yjy-pilot-makeup:leave" }]);
  m.cards.mockResolvedValue([{ id: "coupon", expiresAt: "2026-11-01T15:59:59Z", available: 1, expired: false, closed: false, openingIssue: null }]);
  m.sessions.mockResolvedValue([{ id: "valid", templateId: "guitar", nameSnapshot: "Guitar", startsAt: new Date("2026-10-20T02:00Z") }, { id: "expired", templateId: "guitar", nameSnapshot: "Guitar", startsAt: new Date("2026-11-02T02:00Z") }]);
});
it("offers the separate makeup card, original date, and only same-term slots", async () => {
  const result = await getMusicLeaveWorkspace("store", [{ id: "student", name: "Learner" }]);
  expect(result.rows[0]).toMatchObject({ id: "leave", cardId: "coupon", state: "待安排", separate: true, sourceDate: "2026-10-01", sessions: [{ id: "valid" }] });
  expect(m.bookings.mock.calls[0][0].where).toMatchObject({ storeId: "store", customerId: { in: ["student"] } });
});
it("offers no second reservation when a makeup is already reserved", async () => {
  m.bookings.mockReset().mockResolvedValueOnce([leaf]).mockResolvedValue([{ id: "child", cardId: "coupon", status: "RESERVED", session: { id: "booked", startsAt: new Date("2026-10-20T02:00Z"), nameSnapshot: "Guitar" } }]);
  const result = await getMusicLeaveWorkspace("store", [{ id: "student", name: "Learner" }]);
  expect(result.rows[0]).toMatchObject({ state: "已安排", sessions: [], booking: { id: "booked" } });
});
it("blocks missing, expired, or invalid makeup balances", async () => {
  m.cards.mockResolvedValue([{ id: "coupon", expiresAt: "2026-09-01T00:00Z", available: 0, expired: true, closed: false, openingIssue: null }]);
  const result = await getMusicLeaveWorkspace("store", [{ id: "student", name: "Learner" }]);
  expect(result.rows[0]).toMatchObject({ state: "需處理", issue: "已超過補課期限", sessions: [] });
});

it("never offers a full session or a session the learner already attends",async()=>{
 m.sessions.mockResolvedValue([{id:"full",templateId:"guitar",nameSnapshot:"Guitar",startsAt:new Date("2026-10-20T02:00Z"),capacity:1,bookings:[{customerId:"other"}]},{id:"duplicate",templateId:"guitar",nameSnapshot:"Guitar",startsAt:new Date("2026-10-20T02:00Z"),capacity:2,bookings:[{customerId:"student"}]}]);
 const result=await getMusicLeaveWorkspace("store",[{id:"student",name:"Learner"}]);
 expect(result.rows[0].sessions).toEqual([]);
 expect(m.coupons.mock.calls[0][0].where.closedAt).toBeNull();
});
