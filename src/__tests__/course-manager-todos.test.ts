import {FEATURES} from "@/lib/feature-flags";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ scope: vi.fn(), feature: vi.fn(), stores: vi.fn(), purchases: vi.fn(), count: vi.fn(), bookings: vi.fn(), recheck: vi.fn() }));
vi.mock("@/lib/industry-module-server", () => ({ requireCourseStore: m.scope }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: m.feature }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findMany: m.stores } } }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { coursePurchase: { count: m.purchases }, courseBooking: { count: m.count, findMany: m.bookings, findFirst: m.recheck } } }));
import { getCourseManagerTodoCounts, getIncompleteCourseCandidates, isCourseBookingStillIncomplete } from "@/server/queries/course-manager-todos";
const now = new Date("2026-09-17T01:00:00Z");
beforeEach(() => { vi.resetAllMocks(); m.feature.mockResolvedValue(true); m.stores.mockResolvedValue([{ id: "course", slug: "course-shop" }]); m.bookings.mockResolvedValue([]); m.purchases.mockResolvedValue(2); m.count.mockResolvedValue(3); });
it("counts course pending purchases and yesterday actual attendees, within the fixed store and Taipei day", async () => {
  expect(await getCourseManagerTodoCounts("course", now)).toEqual({ pendingPaymentCount: 2, incompleteServiceCount: 3 });
  expect(m.scope).toHaveBeenCalledWith("course");
  expect(m.purchases).toHaveBeenCalledWith({ where: { storeId: "course", status: "PENDING" } });
  expect(m.count).toHaveBeenCalledWith({ where: { storeId: "course", status: "RESERVED", session: { storeId: "course", cancelledAt: null, startsAt: { gte: new Date("2026-09-15T16:00:00Z"), lte: new Date("2026-09-16T15:59:59.999Z") } } } });
});
it("uses actual class end plus one hour, excludes cancellation and only scans enabled course stores", async () => {
  await getIncompleteCourseCandidates(now);
  expect(m.stores).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ industryModule: "COURSE", isDemo: false }) }));
  expect(m.bookings).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: { in: ["course"] }, status: "RESERVED", session: { cancelledAt: null, startsAt: { gte: new Date("2026-09-14T16:00:00Z") }, endsAt: { lte: new Date("2026-09-17T00:00:00Z") } } } }));
});
it("does not query candidates when the store reminder feature is disabled", async () => {
  m.feature.mockResolvedValue(false);
  expect(await getIncompleteCourseCandidates(now)).toEqual([]);
  expect(m.bookings).not.toHaveBeenCalled();
});
it("rechecks completion, cancellation, store and extended class end after claiming", async () => {
  await isCourseBookingStillIncomplete("course", "booking", now);
  expect(m.recheck).toHaveBeenCalledWith({ where: { id: "booking", storeId: "course", status: "RESERVED", session: { storeId: "course", cancelledAt: null, endsAt: { lte: new Date("2026-09-17T00:00:00Z") } } }, select: { id: true } });
});

it("excludes unactivated stores before reminder feature checks, preserving active-store grants", async () => {
 const allStores=[{id:"active",slug:"active-shop",activated:true},{id:"unactivated",slug:"pending-shop",activated:false}];
 m.stores.mockImplementation(async ({where})=>{
  expect(where.featureEntitlements).toEqual({some:{featureKey:{in:["business.fitness","business.music"]},status:"ENABLED"}});
  return allStores.filter(store=>store.activated);
 });
 m.feature.mockImplementation(async (id)=>{if(id==="unactivated")throw new Error("module not activated");return true;});
 m.bookings.mockResolvedValue([{id:"booking",storeId:"active",sessionId:"session",customerName:"Synthetic",session:{startsAt:now,endsAt:now}}]);
 expect(await getIncompleteCourseCandidates(now)).toEqual([expect.objectContaining({storeId:"active",storeSlug:"active-shop"})]);
 expect(m.feature).toHaveBeenCalledExactlyOnceWith("active", FEATURES.LINE_REMINDER);
 expect(m.bookings).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:{in:["active"]}})}));
});
