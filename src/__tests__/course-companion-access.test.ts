import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({manager: vi.fn(), account: vi.fn(), transaction: vi.fn(), change: vi.fn(), authorize: vi.fn(), settings: vi.fn()}));
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
  m.transaction.mockImplementation((_store, work) => work({$queryRaw: m.authorize}));
});
it("cannot bypass assigned-coach authorization by setting coach=true", async () => {
  expect(await saveCourseCompanionUsage(input)).toMatchObject({success: false});
  expect(m.change).not.toHaveBeenCalled();
  expect(await loadCourseCompanionUsage({bookingId: "guest", coach: true})).toMatchObject({success: false});
});
it("checks booking.update and trial.create for manager corrections", async () => {
  m.change.mockResolvedValue({id: "guest"});
  expect(await saveCourseCompanionUsage({...input, coach: false})).toMatchObject({success: true});
  expect(m.manager.mock.calls.map(call => call[0])).toEqual(["booking.update", "trial.create"]);
});
it("rejects trial changes when the store disables trials", async () => {
  m.settings.mockResolvedValue({trialEnabled: false});
  expect(await saveCourseCompanionUsage({...input, coach: false})).toMatchObject({success: false});
  expect(m.change).not.toHaveBeenCalled();
});
