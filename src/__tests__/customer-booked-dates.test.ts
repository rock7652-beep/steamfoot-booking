import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ customer: vi.fn(), bookings: vi.fn(), permission: vi.fn(), store: vi.fn(), industry: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findFirst: mocks.customer }, booking: { findMany: mocks.bookings } } }));
vi.mock("@/lib/permissions", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/session", () => ({ requireStaffSession: async () => ({ role: "OWNER", storeId: "store-a", staffId: "owner-a" }) }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: mocks.store }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: mocks.industry }));
vi.mock("@/lib/manager-visibility", () => ({ getManagerCustomerWhere: () => ({ storeId: "store-a" }) }));
import { fetchCustomerBookedDates } from "@/server/actions/customer-booked-dates";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.store.mockResolvedValue("store-a");
  mocks.industry.mockResolvedValue("steamfoot");
  mocks.customer.mockResolvedValue({ id: "customer-a" });
  mocks.bookings.mockResolvedValue([]);
});
it("scopes active bookings to the selected customer, current store and requested dates", async () => {
  mocks.bookings.mockResolvedValue([{ bookingDate: new Date("2026-09-11"), slotTime: "14:30", people: 2 }]);
  expect(await fetchCustomerBookedDates("customer-a", "2026-09-09", "2026-09-23")).toEqual([{ date: "2026-09-11", time: "14:30", people: 2 }]);
  expect(mocks.permission).toHaveBeenCalledWith("booking.create");
  expect(mocks.customer).toHaveBeenCalledWith({ where: { id: "customer-a", storeId: "store-a" }, select: { id: true } });
  expect(mocks.bookings.mock.calls[0][0].where).toEqual({ storeId: "store-a", customerId: "customer-a", bookingStatus: { in: ["PENDING", "CONFIRMED"] }, bookingDate: { gte: new Date("2026-09-09"), lte: new Date("2026-09-23") } });
});
it("does not read bookings of an inaccessible customer", async () => {
  mocks.customer.mockResolvedValue(null);
  expect(await fetchCustomerBookedDates("other", "2026-09-09", "2026-09-23")).toEqual([]);
  expect(mocks.bookings).not.toHaveBeenCalled();
});
it("does not query SPA bookings", async () => {
  mocks.industry.mockResolvedValue("spa");
  expect(await fetchCustomerBookedDates("customer-a", "2026-09-09", "2026-09-23")).toEqual([]);
  expect(mocks.customer).not.toHaveBeenCalled();
  expect(mocks.bookings).not.toHaveBeenCalled();
});
it("fails closed without an active store", async () => {
  mocks.store.mockResolvedValue(null);
  expect(await fetchCustomerBookedDates("customer-a", "2026-09-09", "2026-09-23")).toEqual([]);
  expect(mocks.bookings).not.toHaveBeenCalled();
});
it("requires permission before reading data", async () => {
  mocks.permission.mockRejectedValue(new Error("Forbidden"));
  await expect(fetchCustomerBookedDates("customer-a", "2026-09-09", "2026-09-23")).rejects.toThrow("Forbidden");
  expect(mocks.customer).not.toHaveBeenCalled();
});
it.each([["2026-02-30", "2026-03-01"], ["2026-09-23", "2026-09-09"], ["2026-09-09", "2030-09-09"]])("rejects invalid or unbounded range %s %s", async (first, last) => {
  await expect(fetchCustomerBookedDates("customer-a", first, last)).rejects.toThrow();
  expect(mocks.bookings).not.toHaveBeenCalled();
});
