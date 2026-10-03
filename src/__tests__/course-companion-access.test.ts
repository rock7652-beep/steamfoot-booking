import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({manager: vi.fn(), account: vi.fn(), transaction: vi.fn(), change: vi.fn(), authorize: vi.fn(), settings: vi.fn(), before: vi.fn(), cards: vi.fn(), after: vi.fn()}));
vi.mock("next/server", () => ({after: m.after}));
vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
vi.mock("@/server/services/course-access", () => ({courseManager: m.manager, courseAccount: m.account, courseTransaction: m.transaction}));
vi.mock("@/server/services/course-companions", () => ({changeCompanionUsage: m.change}));
vi.mock("@/server/services/course-booking", () => ({reserveCourseInTransaction: vi.fn()}));
vi.mock("@/lib/course-db", () => ({coursePrisma: {}}));
vi.mock("@/lib/db", () => ({prisma: {}}));
vi.mock("@/lib/feature-gate", () => ({getStoreLimitsByStoreId: vi.fn().mockResolvedValue({maxMonthlyBookings: null})}));
vi.mock("@/lib/shop-config", () => ({getTrialSettings: m.settings, clampTrialTotal: () => 300}));
import { loadCourseCompanionUsage, saveCourseCompanionUsage } from "@/server/actions/course-companions";
const input = {bookingId: "guest", mode: "TRIAL", coach: true, requestKey: "008dc0cb-088e-4ba9-8212-8370d38d1d76", expectedUpdatedAt: "2026-10-03T00:00:00.000Z"};
beforeEach(() => {
  vi.clearAllMocks();
  m.account.mockResolvedValue({storeId: "store-a", user: {id: "user", name: "教練"}});
  m.manager.mockResolvedValue({storeId: "store-a", user: {id: "manager", name: "店長"}});
  m.settings.mockResolvedValue({trialEnabled: true});
  m.authorize.mockResolvedValue([]);
  m.before.mockResolvedValue({cardId:"card-a",pointCost:2});
  m.change.mockResolvedValue({id:"guest",cardId:null,customerId:null,customerName:"同行者",updatedAt:new Date("2026-10-03T00:01:00Z"),pointCost:0});
  m.cards.mockResolvedValue([{id:"card-a",unit:"POINT",remaining:8,closedAt:null,expiresAt:new Date("2099-01-01"),bookings:[{pointCost:2}]}]);
  m.transaction.mockImplementation((_store, work) => work({$queryRaw: m.authorize,courseBooking:{findFirstOrThrow:m.before},coursePointCard:{findMany:m.cards}}));
});
it("cannot bypass assigned-coach authorization by setting coach=true", async () => {
  expect(await saveCourseCompanionUsage(input)).toMatchObject({success: false});
  expect(m.change).not.toHaveBeenCalled();
  expect(await loadCourseCompanionUsage({bookingId: "guest", coach: true})).toMatchObject({success: false});
});
it("checks booking.update and trial.create for manager corrections", async () => {
  expect(await saveCourseCompanionUsage({...input, coach: false})).toMatchObject({success: true});
  expect(m.manager.mock.calls.map(call => call[0])).toEqual(["booking.update", "trial.create"]);
});
it("rejects trial changes when the store disables trials", async () => {
  m.settings.mockResolvedValue({trialEnabled: false});
  expect(await saveCourseCompanionUsage({...input, coach: false})).toMatchObject({success: false});
  expect(m.change).not.toHaveBeenCalled();
});

it("returns the committed usage and released source-card balance without waiting for refresh", async () => {
  m.authorize.mockResolvedValue([{id:"guest"}]);
  const result = await saveCourseCompanionUsage(input);
  expect(result).toMatchObject({success:true,receipt:{booking:{id:"guest",unit:"TRIAL",cost:0,available:null},balances:[{id:"card-a",available:6}],returned:{amount:2,unit:"POINT"}}});
  expect(m.after).toHaveBeenCalledOnce();
});
it("keeps a same-card update from claiming points were returned", async () => {
  m.authorize.mockResolvedValue([{id:"guest"}]);
  m.change.mockResolvedValue({id:"guest",cardId:"card-a",customerId:null,customerName:"同行者",updatedAt:new Date("2026-10-03T00:01:00Z"),pointCost:2});
  expect(await saveCourseCompanionUsage({...input,mode:"RESERVER"})).toMatchObject({success:true,receipt:{returned:null,booking:{available:6,cost:2}}});
});
