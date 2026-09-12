import { describe, expect, it } from "vitest";
import { applicableLocations, spaEndTime, staffAvailable, overlaps, validSpaDate } from "@/lib/spa-scheduling";

describe("SPA scheduling rules", () => {
  it("rejects impossible dates", () => {
    expect(validSpaDate("2026-02-30")).toBe(false);
    expect(validSpaDate("2028-02-29")).toBe(true);
  });
  it("includes buffer, permits midnight end, rejects crossing days", () => {
    expect(spaEndTime("22:45", [{ serviceMinutes: 60, bufferMinutes: 15 }])).toBe("24:00");
    expect(() => spaEndTime("23:00", [{ serviceMinutes: 60, bufferMinutes: 15 }])).toThrow();
    expect(() => spaEndTime("25:00", [{ serviceMinutes: 60, bufferMinutes: 0 }])).toThrow();
  });
  it("allows adjacent bookings but blocks partial and enclosing overlaps", () => {
    expect(overlaps("10:00", "11:00", "11:00", "12:00")).toBe(false);
    expect(overlaps("10:00", "11:00", "10:30", "12:00")).toBe(true);
    expect(overlaps("10:00", "13:00", "11:00", "12:00")).toBe(true);
  });
  it("requires a location compatible with every selected service", () => {
    const locations = [{ id: "a" }, { id: "b" }];
    expect(applicableLocations(locations, [["a", "b"], ["b"]])).toEqual([{ id: "b" }]);
    expect(applicableLocations(locations, [["a"], []])).toEqual([]);
  });
  it("blocks off-shift, full-day leave and partial leave", () => {
    const shift = { startTime: "10:00", endTime: "18:00", isActive: true };
    expect(staffAvailable("09:00", "10:30", shift, [])).toBe(false);
    expect(staffAvailable("10:00", "11:00", shift, [{ type: "UNAVAILABLE", startTime: null, endTime: null }])).toBe(false);
    expect(staffAvailable("10:00", "11:00", shift, [{ type: "UNAVAILABLE", startTime: "10:30", endTime: "11:30" }])).toBe(false);
    expect(staffAvailable("10:00", "11:00", shift, [{ type: "UNAVAILABLE", startTime: "11:00", endTime: "11:30" }])).toBe(true);
  });
  it("permits explicit extra availability and merges adjacent windows", () => {
    const extra = [{ type: "AVAILABLE", startTime: "09:00", endTime: "10:00" }];
    expect(staffAvailable("09:00", "10:00", null, extra)).toBe(true);
    expect(staffAvailable("09:00", "11:00", { startTime: "10:00", endTime: "18:00", isActive: true }, extra)).toBe(true);
    expect(staffAvailable("09:00", "11:00", { startTime: "10:30", endTime: "18:00", isActive: true }, extra)).toBe(false);
  });
});
