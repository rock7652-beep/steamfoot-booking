import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ permission: vi.fn(), access: vi.fn(), hours: vi.fn(), bookings: vi.fn(), duty: vi.fn(), config: vi.fn(), bookable: vi.fn(), enabled: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.permission }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/store-view-context-server", () => ({ resolveStoreViewContextFromCookie: vi.fn(), storeIdForViewContext: vi.fn(), userForViewContext: vi.fn() }));
vi.mock("@/lib/store", () => ({ validateStoreAccess: m.access }));
vi.mock("@/lib/db", () => ({ prisma: { booking: { groupBy: m.bookings }, dutyAssignment: { findMany: m.duty }, shopConfig: { findUnique: m.config } } }));
vi.mock("@/lib/store-operating-status", () => ({ isStoreBookable: m.bookable }));
vi.mock("@/lib/business-hours-resolver", () => ({ loadDayBusinessHoursContext: m.hours, applySlotOverrides: (rule: { slots: unknown[] }) => rule.slots }));
vi.mock("@/lib/shop-config", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/shop-config")>(), isDutySchedulingEnabled: m.enabled }));
import { fetchDaySlots } from "@/server/actions/slots";
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-26T04:00:00Z"));
  vi.spyOn(console, "info").mockImplementation(() => {});
  m.permission.mockResolvedValue({ id: "owner", role: "OWNER" }); m.access.mockResolvedValue("synthetic-steam");
  m.bookable.mockResolvedValue(true); m.enabled.mockResolvedValue(true);
  m.hours.mockResolvedValue({ dateObj: new Date("2026-11-26T00:00:00Z"), slotOverrides: [], rule: { closed: false,
    slots: ["11:00", "12:15", "13:00", "14:00"].map(startTime => ({ startTime, capacity: 6, isEnabled: true })) } });
  m.bookings.mockResolvedValue([{ slotTime: "13:00", _sum: { people: 4 } }]);
  m.duty.mockResolvedValue([{ slotTime: "12:15" }, { slotTime: "13:00" }]);
  m.config.mockResolvedValue({ bookableUntilDate: null, bookingOpensAt: null, bookingWindowDays: 1 });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("staff customer view enforces the real booking window, 30-minute cutoff, duty and occupied capacity", async () => {
  const { slots } = await fetchDaySlots("2026-11-26", "synthetic-steam", { customerView: true });
  expect(slots.map(s => [s.startTime, s.available])).toEqual([["12:15", 0], ["13:00", 2]]);
  expect(m.permission).toHaveBeenCalledWith("booking.read", undefined, { storeId: "synthetic-steam" });
  expect(m.bookings.mock.calls[0][0].where.storeId).toBe("synthetic-steam");
  expect(m.config.mock.calls[0][0].where.storeId).toBe("synthetic-steam");
});
it("staff's existing default view retains its original behavior", async () => {
  const { slots } = await fetchDaySlots("2026-11-26", "synthetic-steam");
  expect(slots.find(s => s.startTime === "12:15")?.available).toBe(6);
  expect(m.config).not.toHaveBeenCalled();
});
it("customer view cannot combine with retrospective capacity override", async () => {
  await expect(fetchDaySlots("2026-11-26", "synthetic-steam", { customerView: true, allowPast: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(m.hours).not.toHaveBeenCalled();
});
it("not-yet-open and beyond-window dates do not advertise bookable slots", async () => {
  m.config.mockResolvedValueOnce({ bookingOpensAt: new Date("2026-11-27T04:00:00Z"), bookingWindowDays: 1 });
  expect((await fetchDaySlots("2026-11-26", "synthetic-steam", { customerView: true })).slots).toEqual([]);
  expect((await fetchDaySlots("2026-11-28", "synthetic-steam", { customerView: true })).slots).toEqual([]);
});
it("permission and tenant denial stop the authoritative read", async () => {
  m.permission.mockRejectedValueOnce(new Error("DENIED")); await expect(fetchDaySlots("2026-11-26", "synthetic-steam", { customerView: true })).rejects.toThrow("DENIED");
  m.access.mockRejectedValueOnce(new Error("FOREIGN_STORE")); await expect(fetchDaySlots("2026-11-26", "foreign", { customerView: true })).rejects.toThrow("FOREIGN_STORE");
  expect(m.hours).not.toHaveBeenCalled(); expect(m.bookings).not.toHaveBeenCalled();
});
