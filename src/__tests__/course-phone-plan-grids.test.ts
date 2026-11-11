import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ cards: vi.fn(), adjustments: vi.fn() }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { coursePointCard: { findMany: m.cards } } }));
vi.mock("@/server/services/course-session-adjustment-records", () => ({ courseSessionAdjustmentRecords: m.adjustments }));
import { readCoursePhonePlanGrids } from "@/server/queries/course-phone-plan-grids";
beforeEach(() => { vi.resetAllMocks(); m.cards.mockResolvedValue([{ id: "card", entries: [{ points: 8 }], bookings: [{ id: "attended", pointCost: 1, session: { startsAt: new Date("2026-11-03T03:00:00Z") } }] }]); m.adjustments.mockResolvedValue([]); });
it("derives eight immutable purchased cells, selects only this store's learner and excludes reservations", async () => {
  expect((await readCoursePhonePlanGrids("store", "child-a", ["card"])).get("card")).toMatchObject({ total: 8, dates: ["2026-11-03T03:00:00.000Z"] });
  const input = m.cards.mock.calls[0][0];
  expect(input.where).toMatchObject({ storeId: "store", id: { in: ["card"] }, members: { some: { storeId: "store", customerId: "child-a" } }, musicOpeningStateRequired: false });
  expect(input.select.bookings.where).toMatchObject({ storeId: "store", customerId: "child-a", status: "ATTENDED", absenceKind: null, session: { cancelledAt: null } });
});
it("includes dated backfills but excludes reversals, voids and another learner's records", async () => {
  const base = { cardId: "card", customerId: "child-a", operation: "BACKFILL", occurredOn: "2026-11-02", quantity: 1, reversalOf: null };
  m.adjustments.mockResolvedValue([{ ...base, id: "valid" }, { ...base, id: "reversed" }, { ...base, id: "reverse", operation: "REVERSE", reversalOf: "reversed" }, { ...base, id: "void", operation: "VOID", recordedAt: "2026-11-11T02:00:00Z" }]);
  const result = (await readCoursePhonePlanGrids("store", "child-a", ["card"])).get("card")!;
  expect(result.total).toBe(8); expect(result.dates).toHaveLength(2); expect(result.dates[0]).toBe("2026-11-01T16:00:00.000Z");
});
it("does not invent purchased quantities or silently truncate inconsistent history", async () => {
  m.cards.mockResolvedValue([{ id: "missing", entries: [], bookings: [] }, { id: "overflow", entries: [{ points: 1 }], bookings: [{ pointCost: 2, session: { startsAt: new Date() } }] }]);
  expect((await readCoursePhonePlanGrids("store", "child-a", ["missing", "overflow"])).size).toBe(0);
});
it('uses the actual void operation timestamp and clears it when the void is reversed',async()=>{
 const original={id:'void',cardId:'card',customerId:'child-a',operation:'VOID',quantity:2,occurredOn:null,recordedAt:'2026-11-10T16:00:00Z',reversalOf:null};
 m.adjustments.mockResolvedValue([original]);let result=(await readCoursePhonePlanGrids('store','child-a',['card'])).get('card')!;
 expect(result.dates).toHaveLength(1);expect(result.voidedDates).toEqual(['2026-11-10T16:00:00Z','2026-11-10T16:00:00Z']);
 m.adjustments.mockResolvedValue([original,{...original,id:'reverse',operation:'REVERSE',reversalOf:'void'}]);result=(await readCoursePhonePlanGrids('store','child-a',['card'])).get('card')!;
 expect(result.voidedDates??[]).toEqual([]);expect(result.dates).toHaveLength(1);
});
it('combines all authorized shared members including backfills and voids into one full-plan grid',async()=>{
 m.cards.mockResolvedValue([{id:'card',members:[{customerId:'child-a'},{customerId:'child-b'}],entries:[{points:10}],bookings:[{id:'a',customerId:'child-a',pointCost:1,session:{startsAt:new Date('2026-11-03T02:00Z')}},{id:'b',customerId:'child-b',pointCost:1,session:{startsAt:new Date('2026-11-04T02:00Z')}}]}]);
 m.adjustments.mockResolvedValue([{id:'manual-b',cardId:'card',customerId:'child-b',operation:'BACKFILL',quantity:1,occurredOn:'2026-11-05',reversalOf:null},{id:'void-b',cardId:'card',customerId:'child-b',operation:'VOID',quantity:1,recordedAt:'2026-11-11T02:00Z',reversalOf:null}]);
 const grid=(await readCoursePhonePlanGrids('store','child-a',['card'],undefined,['child-a','child-b'])).get('card')!;
 expect(grid.total).toBe(10);expect(grid.dates).toHaveLength(3);expect(grid.voidedDates).toHaveLength(1);expect(m.cards.mock.calls[0][0].select.bookings.where).not.toHaveProperty('customerId');
});
it.each(['member','old-booking','old-backfill','old-void'])('does not present a partial shared grid when an unauthorized %s exists',async kind=>{
 const card={id:'card',members:[{customerId:'child-a'}],entries:[{points:10}],bookings:[] as Array<{id:string;customerId:string;pointCost:number;session:{startsAt:Date}}>};
 if(kind==='member')card.members.push({customerId:'hidden'});
 if(kind==='old-booking')card.bookings.push({id:'old',customerId:'hidden',pointCost:1,session:{startsAt:new Date('2026-11-03T02:00Z')}});
 if(kind==='old-backfill')m.adjustments.mockResolvedValue([{id:'manual',cardId:'card',customerId:'hidden',operation:'BACKFILL',quantity:1,occurredOn:'2026-11-03',reversalOf:null}]);
 if(kind==='old-void')m.adjustments.mockResolvedValue([{id:'void',cardId:'card',customerId:'hidden',operation:'VOID',quantity:1,recordedAt:'2026-11-03T02:00Z',reversalOf:null}]);
 m.cards.mockResolvedValue([card]);expect((await readCoursePhonePlanGrids('store','child-a',['card'],undefined,['child-a'])).size).toBe(0);
});

it('keeps authorized shared user names attached to their actual dates',async()=>{
 m.cards.mockResolvedValue([{id:'shared',members:[{customerId:'child-a'},{customerId:'child-b'}],entries:[{points:8}],bookings:[{id:'visit',customerId:'child-b',customerName:'孩子乙',pointCost:1,session:{startsAt:new Date('2026-11-03T02:00Z')}}]}]);
 const grid=(await readCoursePhonePlanGrids('store','child-a',['shared'],undefined,['child-a','child-b'])).get('shared');expect(grid?.completed).toEqual([{id:'visit:0',date:'2026-11-03T02:00:00.000Z',customerName:'孩子乙'}]);
});
