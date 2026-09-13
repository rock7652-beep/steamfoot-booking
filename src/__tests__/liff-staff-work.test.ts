import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.hoisted(() => vi.fn());
const resolveAccess = vi.hoisted(() => vi.fn());
const bookingFindMany = vi.hoisted(() => vi.fn());
const availabilityFindMany = vi.hoisted(() => vi.fn());
const exceptionFindMany = vi.hoisted(() => vi.fn());
const customerFindMany = vi.hoisted(() => vi.fn());
const resolveRequestStore = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ requireSession }));
vi.mock("@/server/services/staff-member-access", () => ({ resolveActiveStaffMemberForStore: resolveAccess }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: {
  spaBooking: { findMany: bookingFindMany },
  spaStaffAvailability: { findMany: availabilityFindMany },
  spaStaffAvailabilityException: { findMany: exceptionFindMany },
} }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findMany: customerFindMany } } }));
vi.mock("@/server/services/member-request-store", () => ({ resolveMemberRequestStoreId: resolveRequestStore }));

import { fetchLiffStaffWork } from "@/server/actions/spa-liff-staff-work";

beforeEach(() => {
  vi.resetAllMocks();
  requireSession.mockResolvedValue({ id: "member-1", role: "CUSTOMER", storeId: "store-1" });
  resolveRequestStore.mockResolvedValue("store-1");
  resolveAccess.mockResolvedValue({ userId: "member-1", storeId: "store-1", customerId: "customer-member", staffId: "staff-1", staffName: "小美" });
  bookingFindMany.mockResolvedValueOnce([{ id: "booking-1", customerId: "customer-1", bookingDate: new Date("2026-09-13T00:00:00Z"), startTime: "10:00", endTime: "11:00", status: "CONFIRMED", serviceNameSnapshot: "按摩", notes: "力道輕一些", serviceLocation: { name: "美容床 1" }, items: [{ treatmentNameSnapshot: "按摩 60 分", variantSnapshot: null, serviceMinutes: 60, bufferMinutes: 10 }] }]).mockResolvedValueOnce([{ bookingDate: new Date("2026-09-13T00:00:00Z") }]);
  availabilityFindMany.mockResolvedValue([{ dayOfWeek: 0, startTime: "10:00", endTime: "18:00", isActive: true }]);
  exceptionFindMany.mockResolvedValue([]);
  customerFindMany.mockResolvedValue([{ id: "customer-1", name: "測試顧客" }]);
});

describe("LIFF staff work projection", () => {
  it("reads only the linked staff and exact store", async () => {
    const result = await fetchLiffStaffWork({ date: "2026-09-13" });
    expect(result).toMatchObject({
      status: "ok",
      staffName: "小美",
      rows: [{ customerName: "測試顧客", locationName: "美容床 1", items: [{ serviceMinutes: 60, bufferMinutes: 10 }] }],
      calendarDays: expect.arrayContaining([{ date: "2026-09-13", bookingCount: 1, isLeave: false }]),
    });
    expect(bookingFindMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: expect.objectContaining({ storeId: "store-1", serviceStaffId: "staff-1" }) }));
    expect(customerFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store-1" }) }));
  });
  it("marks leave from the effective roster without treating empty days as leave", async () => {
    availabilityFindMany.mockResolvedValue([{ dayOfWeek: 1, startTime: "10:00", endTime: "18:00", isActive: true }]);
    exceptionFindMany.mockResolvedValue([
      { date: new Date("2026-09-14T00:00:00Z"), type: "UNAVAILABLE", startTime: null, endTime: null },
      { date: new Date("2026-09-15T00:00:00Z"), type: "AVAILABLE", startTime: "12:00", endTime: "16:00" },
    ]);
    const result = await fetchLiffStaffWork({ date: "2026-09-13" });
    expect(result).toMatchObject({
      status: "ok",
      calendarDays: expect.arrayContaining([
        { date: "2026-09-13", bookingCount: 1, isLeave: true },
        { date: "2026-09-14", bookingCount: 0, isLeave: true },
        { date: "2026-09-15", bookingCount: 0, isLeave: false },
        { date: "2026-09-21", bookingCount: 0, isLeave: false },
      ]),
    });
  });
  it("returns no access before querying work data", async () => {
    resolveAccess.mockResolvedValue(null);
    expect(await fetchLiffStaffWork()).toEqual({ status: "no_access" });
    expect(bookingFindMany).not.toHaveBeenCalled();
  });
  it("treats a signed-out browser as no access instead of a service failure", async () => {
    requireSession.mockRejectedValue(new Error("not signed in"));
    expect(await fetchLiffStaffWork()).toEqual({ status: "no_access" });
    expect(bookingFindMany).not.toHaveBeenCalled();
  });
  it("allows an owner session only through the same verified store link", async () => {
    requireSession.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    await fetchLiffStaffWork();
    expect(resolveAccess).toHaveBeenCalledWith("owner", "store-1");
  });
});
