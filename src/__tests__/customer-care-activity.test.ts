import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ customers: vi.fn(), records: vi.fn(), steam: vi.fn(), course: vi.fn(), spa: vi.fn(), beauty: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findMany: m.customers }, customerFollowUp: { findMany: m.records }, booking: { findMany: m.steam } } }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { courseBooking: { findMany: m.course } } }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: { spaBooking: { findMany: m.spa } } }));
vi.mock("@/lib/beauty-db", () => ({ beautyPrisma: { beautyAppointment: { findMany: m.beauty } } }));
import { getCustomerCareActivity } from "@/server/queries/customer-care-activity";
beforeEach(() => {
  vi.clearAllMocks(); m.customers.mockResolvedValue([{ id: "a", name: "顧客", phone: null, assignedStaff: null }]); m.records.mockResolvedValue([]); m.steam.mockResolvedValue([]); m.course.mockResolvedValue([]); m.spa.mockResolvedValue([]); m.beauty.mockResolvedValue([]);
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
  it("reads only scoped Beauty reservations and keeps the first upcoming service", async () => {
    const now = new Date("2026-10-06T02:00:00Z");
    m.beauty.mockResolvedValue([{customerId:"a",startsAt:new Date("2026-10-15T02:00:00Z")},{customerId:"a",startsAt:new Date("2026-10-16T02:00:00Z")}]);
    const result = await getCustomerCareActivity("store-a", "beauty", "manager-a", 2026, now);
    expect(result.nextBookings.get("a")).toContain("10/15");
    expect(m.beauty.mock.calls[0][0].where).toEqual({storeId:"store-a",customerId:{in:["a"]},status:"RESERVED",startsAt:{gte:now}});
    expect(m.customers.mock.calls[0][0].where.assignedStaffId).toBe("manager-a");
    expect(m.steam).not.toHaveBeenCalled(); expect(m.course).not.toHaveBeenCalled(); expect(m.spa).not.toHaveBeenCalled();
  });
  it("rejects a retired SPA care request before reading any module's customer or booking data", async () => {
    await expect(getCustomerCareActivity("store-a","spa",null,2026)).rejects.toMatchObject({code:"FORBIDDEN",message:"SPA 模組已移除"});
    for(const query of Object.values(m))expect(query).not.toHaveBeenCalled();
  });
  it("keeps birthday and renewal contacts independent and ignores other birthday years", async () => {
    const common = { customerId: "a", result: "CONTACTED", note: null, createdAt: new Date("2026-10-06T02:00:00Z"), nextFollowUpDate: null, createdBy: { name: "店長" } };
    m.records.mockResolvedValue([{ ...common, id: "renew", careReason: "expiring", careYear: null }, { ...common, id: "old-birthday", careReason: "birthday", careYear: 2025 }, { ...common, id: "birthday", careReason: "birthday", careYear: 2026 }]);
    const result = await getCustomerCareActivity("store-a", "steamfoot", null, 2026);
    expect(result.latest.get("a:birthday")?.id).toBe("birthday"); expect(result.latest.get("a:expiring")?.id).toBe("renew");
  });
});
