import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const memberForm = readFileSync(
  "src/app/(liff)/liff/member-booking/member-booking-form.tsx",
  "utf8",
);
const trialForm = readFileSync(
  "src/app/(liff)/liff/trial-booking/trial-booking-form.tsx",
  "utf8",
);
const monthCalendar = readFileSync(
  "src/components/liff/booking-picker/month-calendar.tsx",
  "utf8",
);
const slotPicker = readFileSync(
  "src/components/liff/booking-picker/slot-picker.tsx",
  "utf8",
);
const webBooking = readFileSync(
  "src/app/(customer)/book/new/booking-calendar-view.tsx",
  "utf8",
);

describe("LIFF member booking compact flow", () => {
  it("shows an explicit date then slot sequence", () => {
    expect(memberForm).toContain("1. 選擇日期");
    expect(memberForm).toContain("2. 選擇時段");
  });

  it("enables compact calendar only for member booking", () => {
    expect(memberForm).toMatch(/requestedPeople=\{people\}\s+compact/);
    expect(trialForm).not.toMatch(/requestedPeople=\{people\}\s+compact/);
  });

  it("uses booking markers instead of general availability dots", () => {
    expect(memberForm).toContain("bookedDates={bookedDates}");
    expect(monthCalendar).toContain("已預約");
    expect(monthCalendar).toContain("bg-blue-500");
    expect(monthCalendar).not.toContain('indicator === "available" ? "bg-green-400"');
  });

  it("shows personal bookings and scarce capacity in LIFF and web", () => {
    expect(slotPicker).toContain("您已預約");
    expect(slotPicker).toContain("bg-yellow-50");
    expect(slotPicker).toContain("display.remainingCapacity <= 2");
    expect(slotPicker).not.toContain("bg-orange-50");
    expect(webBooking).toContain("您已預約");
    expect(webBooking).toContain("bg-yellow-50");
    expect(webBooking).toContain("display.remainingCapacity <= 2");
    expect(webBooking).not.toContain("bg-orange-50");
  });

  it("caps people by usable sessions and guides the submit sequence", () => {
    expect(memberForm).toContain("makeupCredits.length + walletAvail < people");
    expect(memberForm).toContain("people >= maxBookablePeople");
    expect(memberForm).toContain("請選擇日期");
    expect(memberForm).toContain("請選擇時段");
    expect(memberForm).toContain("預約確認：");
    expect(memberForm).toContain("scrollIntoView");
  });
});
