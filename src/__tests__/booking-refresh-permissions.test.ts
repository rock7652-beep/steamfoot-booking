import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  permission: vi.fn(), active: vi.fn(), validate: vi.fn(), module: vi.fn(),
  bookings: vi.fn(), schedule: vi.fn(), slots: vi.fn(),
}));
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
    expect(m.permission).toHaveBeenCalledWith("booking.read");
    expect(m.bookings).not.toHaveBeenCalled();
  });
  it("rejects an unauthorized explicit store", async () => {
    m.validate.mockRejectedValue(new Error("wrong store"));
    await expect(refreshBookingManagement(input)).rejects.toThrow("wrong store");
    expect(m.bookings).not.toHaveBeenCalled();
    expect(m.slots).not.toHaveBeenCalled();
  });
  it("preserves the full booking DTO instead of fabricating payment/wallet defaults", async () => {
    const result = await refreshBookingManagement(input);
    expect(result.monthData).toEqual(await m.bookings.mock.results[0].value);
    expect(m.bookings).toHaveBeenCalledWith(2026, 9, "store-a");
  });
  it("never attaches slots from another active store to a deep-linked store", async () => {
    m.active.mockResolvedValue("store-b");
    const result = await refreshBookingManagement(input);
    expect(m.bookings).toHaveBeenCalledWith(2026, 9, "store-a");
    expect(m.slots).not.toHaveBeenCalled();
    expect(result.slots).toBeNull();
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
