import { expect, it } from "vitest";
import { bookingMatchesExpectation } from "@/lib/booking-action-reconciliation";
const booking = { id: "a", bookingStatus: "COMPLETED", bookingDate: "2026-09-27", slotTime: "11:00", attendedPeople: 2, noShowMakeupGranted: true };
it("requires the correct booking and persisted intent, including attendance and makeup", () => {
  expect(bookingMatchesExpectation(booking, "a", { status: "COMPLETED", attendedPeople: 2, makeupGranted: true })).toBe(true);
  expect(bookingMatchesExpectation(booking, "b", { status: "COMPLETED" })).toBe(false);
  expect(bookingMatchesExpectation(booking, "a", { status: "COMPLETED", attendedPeople: 1 })).toBe(false);
  expect(bookingMatchesExpectation(booking, "a", { status: "COMPLETED", makeupGranted: false })).toBe(false);
  expect(bookingMatchesExpectation(booking, "a", {})).toBe(false);
});
it("requires both rescheduled date and time; old data cannot prove completion", () => {
  expect(bookingMatchesExpectation(booking, "a", { date: "2026-09-27", slotTime: "11:00" })).toBe(true);
  expect(bookingMatchesExpectation(booking, "a", { date: "2026-09-28", slotTime: "11:00" })).toBe(false);
  expect(bookingMatchesExpectation(booking, "a", { date: "2026-09-27", slotTime: "12:00" })).toBe(false);
  expect(bookingMatchesExpectation({ ...booking, bookingStatus: "PENDING" }, "a", { status: "COMPLETED" })).toBe(false);
});
