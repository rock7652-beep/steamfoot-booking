import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ member: vi.fn(), group: vi.fn(), cards: vi.fn(), bookings: vi.fn(), grids: vi.fn(), adjustments: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({ courseMember: m.member }));
vi.mock("@/server/services/course-phone-view", () => ({ readCoursePhoneLearners: m.group }));
vi.mock("@/server/queries/course-members", () => ({ getCourseCards: m.cards }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { courseBooking: { findMany: m.bookings } } }));
vi.mock("@/server/queries/course-phone-plan-grids", () => ({ readCoursePhonePlanGrids: m.grids }));
vi.mock("@/server/services/course-session-adjustment-records", () => ({ courseSessionAdjustmentRecords: m.adjustments }));
import { loadCoursePhoneSummary } from "@/server/actions/course-phone-summary";
beforeEach(() => {
  vi.resetAllMocks();
  m.grids.mockResolvedValue(new Map());
  m.adjustments.mockResolvedValue([]);
  m.member.mockResolvedValue({ storeId: "store", user: { id: "member" } });
  m.group.mockResolvedValue({ status: "phone_group", learners: [{ id: "a", name: "孩子 A" }, { id: "b", name: "孩子 B" }] });
  m.cards.mockImplementation(async (_store: string, customer: string) => [{ id: `card-${customer}`, name: "鋼琴", unit: "SESSION", remaining: customer === "a" ? 8 : 5, available: 4, held: 1, allowShared: false, members: [{ name: "不應出現的其他人" }], entries: [{ note: "內部備註" }] }]);
  m.bookings.mockResolvedValue([{ id: "booking", status: "ATTENDED", absenceKind: null, session: { nameSnapshot: "鋼琴", startsAt: new Date("2026-11-10T02:00:00Z"), cancelledAt: null } }]);
});
it("projects separate balances and courses with strict tenant/learner predicates and no private payload", async () => {
  const result = await loadCoursePhoneSummary();
  expect(result).toMatchObject({ success: true, learners: [{ id: "a", cards: [{ remaining: 8 }] }, { id: "b", cards: [{ remaining: 5 }] }] });
  expect(m.cards.mock.calls.map(call => call.slice(0, 2))).toEqual([["store", "a"], ["store", "b"]]);
  expect(m.bookings.mock.calls.map(([call]) => [call.where.storeId, call.where.customerId])).toEqual([["store", "a"], ["store", "a"], ["store", "b"], ["store", "b"]]);
  expect(JSON.stringify(result)).not.toContain("內部備註"); expect(JSON.stringify(result)).not.toContain("不應出現");
});
it("never queries another learner without a phone grant", async () => {
  m.group.mockResolvedValue({ status: "personal", learners: [{ id: "a", name: "孩子 A" }] });
  expect(await loadCoursePhoneSummary()).toEqual({ success: true, learners: [] });
  expect(m.cards).not.toHaveBeenCalled(); expect(m.bookings).not.toHaveBeenCalled();
});
it("discards course data if revocation or membership changes during the read", async () => {
  m.group.mockResolvedValueOnce({ status: "phone_group", learners: [{ id: "a", name: "孩子 A" }] }).mockResolvedValueOnce({ status: "personal", learners: [{ id: "a", name: "孩子 A" }] });
  expect(await loadCoursePhoneSummary()).toMatchObject({ success: false, error: expect.stringContaining("已更新") });
});

it("merges dated backfills into each authorized learner's recent history without private audit fields", async () => {
  const base = { cardId: "card-a", customerId: "a", operation: "BACKFILL", occurredOn: "2026-11-11", quantity: 2, reversalOf: null, actorName: "內部操作人", reason: "內部原因" };
  m.adjustments.mockResolvedValue([
    { ...base, id: "valid" }, { ...base, id: "old" },
    { ...base, id: "reverse", operation: "REVERSE", reversalOf: "old" },
    { ...base, id: "void", operation: "VOID" },
    { ...base, id: "other-child", customerId: "b" },
    { ...base, id: "foreign-card", cardId: "not-authorized" },
  ]);
  const result = await loadCoursePhoneSummary();expect(result.success).toBe(true);
  if(!result.success)throw Error('summary failed');
  expect(result.learners[0].history.map(row => row.id)).toEqual(["valid", "booking"]);
  expect(result.learners[0].history[0]).toMatchObject({startsAt:"2026-11-10T16:00:00.000Z",dateOnly:true,quantity:2,status:"已出席（補登）",name:"鋼琴"});
  expect(result.learners[1].history.map(row => row.id)).toEqual(["booking"]);
  expect(JSON.stringify(result)).not.toContain("內部原因");expect(JSON.stringify(result)).not.toContain("內部操作人");
  expect(m.adjustments.mock.calls).toEqual([[expect.anything(),"store",["card-a"]],[expect.anything(),"store",["card-b"]]]);
  expect(m.grids.mock.calls[0][3]).toEqual(await m.adjustments.mock.results[0].value);
});
it("removes a corrected backfill on the next read and limits the combined history to the newest twenty records", async () => {
  const record={id:"backfill",cardId:"card-a",customerId:"a",operation:"BACKFILL",occurredOn:"2026-11-11",quantity:1,reversalOf:null};
  m.adjustments.mockResolvedValue([record]);
  const before=await loadCoursePhoneSummary();expect(before).toMatchObject({success:true,learners:[{history:[{id:"backfill"},{id:"booking"}]},{}]});
  m.adjustments.mockResolvedValue([record,{...record,id:"correction",operation:"REVERSE",reversalOf:record.id}]);
  const after=await loadCoursePhoneSummary();expect(after).toMatchObject({success:true,learners:[{history:[{id:"booking"}]},{}]});
  m.adjustments.mockResolvedValue(Array.from({length:25},(_,i)=>({...record,id:`manual-${i}`})));
  const many=await loadCoursePhoneSummary();if(!many.success)throw Error('summary failed');
  expect(many.learners[0].history).toHaveLength(20);expect(many.learners[0].history.every(row=>row.id.startsWith('manual-'))).toBe(true);
});
