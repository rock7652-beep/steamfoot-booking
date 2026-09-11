import { describe, expect, it } from "vitest";
import { applyBookingNotePatch } from "@/app/(dashboard)/dashboard/bookings/booking-note-state";
const first = { id: "b1", notes: "晚到10分鐘", customer: { id: "c1", serviceNote: "怕冷" }, bookingStatus: "COMPLETED" };
const second = { ...first, id: "b2", notes: "其他預約" };
const other = { ...first, id: "b3", customer: { id: "c2", serviceNote: "其他顧客" } };
describe("saved notes synchronize daily list", () => {
  it("clears only the selected booking note, preserving store notes and status", () => {
    const results = [first, second, other].map(b => applyBookingNotePatch(b, { kind: "booking", bookingId: "b1", value: null }));
    expect(results[0]).toEqual({ ...first, notes: null });
    expect(results[1]).toBe(second);
    expect(results[2]).toBe(other);
  });
  it("adds the saved text to the selected booking", () => {
    expect(applyBookingNotePatch({ ...first, notes: null }, { kind: "booking", bookingId: "b1", value: "晚到10分鐘" })).toEqual(first);
  });
  it("updates all bookings for the same customer without changing per-booking notes", () => {
    const results = [first, second, other].map(b => applyBookingNotePatch(b, { kind: "customer", bookingId: "b1", customerId: "c1", value: "不想吹冷氣" }));
    expect(results[0].customer.serviceNote).toBe("不想吹冷氣");
    expect(results[1].customer.serviceNote).toBe("不想吹冷氣");
    expect(results[0].notes).toBe(first.notes);
    expect(results[1].notes).toBe(second.notes);
    expect(results[2]).toBe(other);
  });
});
