import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ store: vi.fn(), staff: vi.fn(), customer: vi.fn(), steam: vi.fn(), course: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: m.store }, staff: { count: m.staff }, customer: { count: m.customer }, booking: { count: m.steam } } }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { courseBooking: { count: m.course } } }));
import { getStoreUsage } from "@/server/queries/usage";

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  // UTC is still September, while the business month in Taiwan is October.
  vi.setSystemTime(new Date("2026-09-30T16:00:00Z"));
  m.store.mockResolvedValue({ id: "course-store", name: "Course", industryModule: "COURSE", plan: "EXPERIENCE" });
  m.staff.mockResolvedValue(1); m.customer.mockResolvedValue(2);
  m.course.mockResolvedValue(3); m.steam.mockResolvedValue(99);
});
afterEach(() => vi.useRealTimers());

it("uses course bookings and the exact Taipei quota window without querying steam bookings", async () => {
  const usage = await getStoreUsage("course-store");
  expect(usage?.metrics.find(metric => metric.label === "本月預約")?.current).toBe(3);
  expect(m.course).toHaveBeenCalledWith({ where: { storeId: "course-store", createdAt: {
    gte: new Date("2026-09-30T16:00:00.000Z"), lte: new Date("2026-10-31T15:59:59.999Z"),
  } } });
  expect(m.steam).not.toHaveBeenCalled();
});

it("keeps existing module bookings separate from course bookings", async () => {
  m.store.mockResolvedValue({ id: "steam-store", name: "Steam", industryModule: "STEAM", plan: "EXPERIENCE" });
  const usage = await getStoreUsage("steam-store");
  expect(usage?.metrics.find(metric => metric.label === "本月預約")?.current).toBe(99);
  expect(m.steam).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "steam-store" }) }));
  expect(m.course).not.toHaveBeenCalled();
});

it("does not read any usage for a missing store", async () => {
  m.store.mockResolvedValue(null);
  expect(await getStoreUsage("missing")).toBeNull();
  expect(m.course).not.toHaveBeenCalled(); expect(m.steam).not.toHaveBeenCalled();
});
