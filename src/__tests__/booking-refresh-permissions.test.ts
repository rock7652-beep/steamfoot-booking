import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  permission: vi.fn(), active: vi.fn(), validate: vi.fn(), module: vi.fn(),
  labels:vi.fn(), bookings: vi.fn(), schedule: vi.fn(), slots: vi.fn(),
}));
vi.mock("@/server/queries/booking-roster-labels",()=>({loadBookingRosterLabels:m.labels}));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.permission }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.active, validateStoreAccess: m.validate }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: m.module }));
vi.mock("@/server/queries/booking", () => ({ getMonthBookingSummary: m.bookings }));
vi.mock("@/lib/query-cache", () => ({ getCachedMonthScheduleSummary: m.schedule }));
vi.mock("@/server/actions/slots", () => ({ fetchDaySlots: m.slots }));
import { refreshBookingManagement } from "@/server/actions/booking-refresh";

const input = { year: 2026, month: 9, storeId: "store-a", date: "2026-09-14" };
beforeEach(() => {
  vi.resetAllMocks();
  m.permission.mockResolvedValue({ role: "OWNER", storeId: "store-a" });
  m.active.mockResolvedValue("store-a");
  m.validate.mockImplementation(async (_user, store) => store);
  m.module.mockResolvedValue("steamfoot");
  m.bookings.mockResolvedValue([{ bookings: [{ bookingType: "PACKAGE", collected: true, customerPlanWallet: { remainingSessions: 7 } }] }]);
  m.schedule.mockResolvedValue({});
  m.slots.mockResolvedValue({ slots: [] });
});

describe("booking refresh read boundary", () => {
  it("requires booking.read before querying customer data", async () => {
    m.permission.mockRejectedValue(new Error("denied"));
    await expect(refreshBookingManagement(input)).rejects.toThrow("denied");
    expect(m.permission).toHaveBeenCalledWith("booking.read", undefined, { storeId: "store-a" });
    expect(m.bookings).not.toHaveBeenCalled();
  });
  it("rejects an unauthorized explicit store", async () => {
    m.validate.mockRejectedValue(new Error("wrong store"));
    await expect(refreshBookingManagement(input)).rejects.toThrow("wrong store");
    expect(m.bookings).not.toHaveBeenCalled();
    expect(m.slots).not.toHaveBeenCalled();
  });
  it("skips active scope lookup for an explicitly authorized month-only read", async () => {
    await refreshBookingManagement({ ...input, date: null });
    expect(m.validate).toHaveBeenCalledWith(expect.anything(), "store-a", "read");
    expect(m.active).not.toHaveBeenCalled();
    expect(m.bookings).toHaveBeenCalledWith(2026, 9, "store-a");
    expect(m.slots).not.toHaveBeenCalled();
  });
  it("still resolves active scope when no explicit store is supplied", async () => {
    await refreshBookingManagement({ year: 2026, month: 9, date: null });
    expect(m.active).toHaveBeenCalledTimes(1);
    expect(m.bookings).toHaveBeenCalledWith(2026, 9, "store-a");
  });
  it("preserves the full booking DTO instead of fabricating payment/wallet defaults", async () => {
    const result = await refreshBookingManagement(input);
    expect(result.monthData).toEqual(await m.bookings.mock.results[0].value);
    expect(m.bookings).toHaveBeenCalledWith(2026, 9, "store-a");
  });
  it("reauthorizes the explicit roster store for slots instead of reading another active cookie store", async () => {
    m.active.mockResolvedValue("store-b");
    const result = await refreshBookingManagement(input);
    expect(m.bookings).toHaveBeenCalledWith(2026, 9, "store-a");
    expect(m.slots).toHaveBeenCalledExactlyOnceWith(input.date, "store-a");
    expect(m.active).not.toHaveBeenCalled();
    expect(result.slots).toEqual([]);
  });
  it("does not use the steamfoot refresh for a SPA store", async () => {
    m.module.mockResolvedValue("spa");
    await expect(refreshBookingManagement(input)).rejects.toThrow();
    expect(m.bookings).not.toHaveBeenCalled();
  });
  it.each(["2026-09-31", "2026-10-01", "2026-09-00"])("rejects invalid selected date %s", async (date) => {
    await expect(refreshBookingManagement({ ...input, date })).rejects.toThrow();
    expect(m.bookings).not.toHaveBeenCalled();
  });
});

it("returns authorized customer labels with the same roster response",async()=>{const labels={enabled:true,assignments:{customer:["tag"]}};m.labels.mockResolvedValue(labels);const result=await refreshBookingManagement(input);expect(m.labels).toHaveBeenCalledWith(result.monthData,"store-a");expect(result.customerLabels).toBe(labels);});
