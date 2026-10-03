import { expect, it } from "vitest";
import { matchesBookingSearch } from "@/lib/booking-month-search";
const booking = { bookingStatus: "PENDING", customer: { name: "黃小明", phone: "0912-345-678", assignedStaff: { displayName: "A" } }, revenueStaff: null, serviceStaff: null, servicePlan: { name: "蒸足" } };
const filters = { search: "黃", status: "", staffName: "", servicePlanId: "" };
const plans = [{ id: "steam", name: "蒸足" }];
it("matches partial names and normalized phone numbers", () => {
  expect(matchesBookingSearch(booking, filters, plans)).toBe(true);
  expect(matchesBookingSearch(booking, { ...filters, search: "０９１２３" }, plans)).toBe(true);
  expect(matchesBookingSearch(booking, { ...filters, search: "陳" }, plans)).toBe(false);
});
it("combines staff, status and service filters with the keyword", () => {
  expect(matchesBookingSearch(booking, { ...filters, staffName: "A", status: "PENDING", servicePlanId: "steam" }, plans)).toBe(true);
  for (const patch of [{ staffName: "B" }, { status: "COMPLETED" }, { servicePlanId: "missing" }])
    expect(matchesBookingSearch(booking, { ...filters, ...patch }, plans)).toBe(false);
});
it("respects revenue then service then assigned staff priority", () => {
  expect(matchesBookingSearch({ ...booking, revenueStaff: { displayName: "B" } }, { ...filters, staffName: "A" }, plans)).toBe(false);
  expect(matchesBookingSearch({ ...booking, serviceStaff: { displayName: "B" } }, { ...filters, staffName: "B" }, plans)).toBe(true);
});
it("does not include cancelled bookings", () => {
  expect(matchesBookingSearch({ ...booking, bookingStatus: "CANCELLED" }, filters, plans)).toBe(false);
});
it("clearing keyword restores other matching bookings while retaining filters", () => {
  expect(matchesBookingSearch(booking, { ...filters, search: "", staffName: "A" }, plans)).toBe(true);
  expect(matchesBookingSearch(booking, { ...filters, search: "", staffName: "B" }, plans)).toBe(false);
});
