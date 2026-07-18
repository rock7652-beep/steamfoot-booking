import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getBookingSubmitErrors,
  shouldClearSelectedSlot,
} from "@/app/(dashboard)/dashboard/bookings/new/booking-submit-validation";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), "src", path), "utf8");

describe("dashboard new-booking visible validation", () => {
  const customerSearch = read(
    "app/(dashboard)/dashboard/bookings/new/customer-search.tsx",
  );
  const bookingForm = read(
    "app/(dashboard)/dashboard/bookings/new/booking-form.tsx",
  );
  const createForm = read(
    "app/(dashboard)/dashboard/bookings/new/booking-create-form.tsx",
  );
  const validation = read(
    "app/(dashboard)/dashboard/bookings/new/booking-submit-validation.ts",
  );

  it("requires selecting a search result with a visible customer error, not a hidden required field", () => {
    expect(createForm).toContain('data.get("customerId")');
    expect(validation).toContain("請從搜尋結果中選擇顧客");
    expect(customerSearch).toContain("data-booking-customer-search");
    expect(customerSearch).not.toMatch(/required[\s\S]{0,180}opacity-0/);
  });

  it("returns visible errors for an unselected typed customer or missing slot", () => {
    expect(getBookingSubmitErrors({ customerId: null, slotTime: "10:00" })).toEqual({
      customer: "請從搜尋結果中選擇顧客",
    });
    expect(getBookingSubmitErrors({ customerId: "customer-1", slotTime: null })).toEqual({
      slot: "請選擇預約時段",
    });
  });

  it("focuses the customer search input when customer selection is missing", () => {
    expect(createForm).toContain("scrollIntoView");
    expect(createForm).toContain("target?.focus()");
    expect(createForm).toContain("data-booking-customer-search");
  });

  it("shows an explicit slot error instead of relying on a required sr-only radio", () => {
    expect(createForm).toContain('data.get("slotTime")');
    expect(validation).toContain("請選擇預約時段");
    expect(bookingForm).toContain("data-booking-slot-section");
    expect(bookingForm).not.toMatch(/name="slotTime"[\s\S]{0,300}required/);
  });

  it("shows people before slots and only clears a selected slot when capacity is insufficient", () => {
    expect(bookingForm.indexOf("預約人數")).toBeLessThan(
      bookingForm.indexOf("{/* Slot Time */}"),
    );
    expect(bookingForm).toContain("shouldClearSelectedSlot(selectedSlot, slots, nextPeople)");
    expect(bookingForm).toContain("人數已變更，請重新選擇時段。");
  });

  it("keeps a selected slot when it fits the new people count and clears it when it does not", () => {
    const slots = [{ startTime: "10:00", capacity: 4, bookedCount: 2, available: 2, isEnabled: true }];
    expect(shouldClearSelectedSlot("10:00", slots, 2)).toBe(false);
    expect(shouldClearSelectedSlot("10:00", slots, 3)).toBe(true);
  });
});
