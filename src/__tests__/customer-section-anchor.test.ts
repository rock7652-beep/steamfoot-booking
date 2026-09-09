import { describe, expect, it } from "vitest";
import { customerSectionId } from "@/app/(dashboard)/dashboard/customers/[id]/customer-section-anchor";
describe("customer section anchors", () => {
  it.each([
    ["#new-booking", "booking"], ["#booking", "booking"], ["#bookings", "bookings"],
    ["#new-booking#bookings", "bookings"], ["#bookings#booking", "booking"],
    ["#booking#unrelated", null], ["", null],
  ])("resolves %s to %s", (hash, expected) => {
    expect(customerSectionId(hash)).toBe(expected);
  });
});
