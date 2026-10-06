import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ customers: vi.fn(), records: vi.fn(), steam: vi.fn(), course: vi.fn(), spa: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findMany: m.customers }, customerFollowUp: { findMany: m.records }, booking: { findMany: m.steam } } }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { courseBooking: { findMany: m.course } } }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: { spaBooking: { findMany: m.spa } } }));
import { getCustomerCareActivity } from "@/server/queries/customer-care-activity";
beforeEach(() => {
  vi.clearAllMocks(); m.customers.mockResolvedValue([{ id: "a", name: "顧客", phone: null, assignedStaff: null }]); m.records.mockResolvedValue([]); m.steam.mockResolvedValue([]); m.course.mockResolvedValue([]); m.spa.mockResolvedValue([]);
});
describe("module-isolated care activity", () => {
  it("reads course reservations only, excludes cancelled sessions, and scopes customer history", async () => {
    m.course.mockResolvedValue([{ customerId: "a", session: { startsAt: new Date("2026-10-15T02:00:00Z") } }]);
    const result = await getCustomerCareActivity("store-a", "course", "coach-a", 2026, new Date("2026-10-06T02:00:00Z"));
    expect(result.nextBookings.get("a")).toContain("10/15");
    expect(m.customers.mock.calls[0][0].where).toMatchObject({ storeId: "store-a", assignedStaffId: "coach-a" });
    expect(m.records.mock.calls[0][0].where).toMatchObject({ storeId: "store-a", customerId: { in: ["a"] } });
    expect(m.course.mock.calls[0][0].where).toMatchObject({ storeId: "store-a", status: "RESERVED", session: { storeId: "store-a", cancelledAt: null } });
    expect(m.steam).not.toHaveBeenCalled(); expect(m.spa).not.toHaveBeenCalled();
  });
  it("never queries Steamfoot bookings for SPA", async () => {
    m.spa.mockResolvedValue([{ customerId: "a", bookingDate: new Date("2026-10-15T00:00:00Z"), startTime: "10:00" }]);
    const result = await getCustomerCareActivity("store-a", "spa", null, 2026, new Date("2026-10-06T02:00:00Z"));
    expect(result.nextBookings.get("a")).toContain("10/15"); expect(m.steam).not.toHaveBeenCalled(); expect(m.course).not.toHaveBeenCalled();
  });
  it("keeps birthday and renewal contacts independent and ignores other birthday years", async () => {
    const common = { customerId: "a", result: "CONTACTED", note: null, createdAt: new Date("2026-10-06T02:00:00Z"), nextFollowUpDate: null, createdBy: { name: "店長" } };
    m.records.mockResolvedValue([{ ...common, id: "renew", careReason: "expiring", careYear: null }, { ...common, id: "old-birthday", careReason: "birthday", careYear: 2025 }, { ...common, id: "birthday", careReason: "birthday", careYear: 2026 }]);
    const result = await getCustomerCareActivity("store-a", "steamfoot", null, 2026);
    expect(result.latest.get("a:birthday")?.id).toBe("birthday"); expect(result.latest.get("a:expiring")?.id).toBe("renew");
  });
});
