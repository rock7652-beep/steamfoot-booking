import { expect, it } from "vitest";
import { courseBookingHistoryLabel } from "@/lib/course-booking-history-label";
const base = { status: "RESERVED", checkedIn: false, unit: "SESSION" };
it("does not call a deducted no-show released", () => {
  expect(courseBookingHistoryLabel({ ...base, status: "NO_SHOW" })).toContain("已扣額度");
});
it("distinguishes source leave, ordinary retained leave, and forfeited group leave", () => {
  expect(courseBookingHistoryLabel({ ...base, status: "CANCELLED", absenceKind: "STUDENT_LEAVE", separateMakeup: true })).toContain("已扣堂，另給補課");
  expect(courseBookingHistoryLabel({ ...base, status: "CANCELLED", absenceKind: "STUDENT_LEAVE" })).toContain("保留原方案堂數");
  expect(courseBookingHistoryLabel({ ...base, status: "CANCELLED", absenceKind: "GROUP_LEAVE_FORFEITED" })).toContain("已扣堂，不補課");
});
it("check-in never implies makeup redemption", () => {
  expect(courseBookingHistoryLabel({ ...base, checkedIn: true, bookingKind: "OPENING_MAKEUP" })).toContain("待確認出席");
  expect(courseBookingHistoryLabel({ ...base, status: "ATTENDED", bookingKind: "OPENING_MAKEUP" })).toContain("已核銷");
});
