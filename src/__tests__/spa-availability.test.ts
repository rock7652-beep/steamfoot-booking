import { describe, expect, it } from "vitest";
import { calculateSpaProviderStartTimes } from "@/lib/spa-availability";

const base = {
  candidateStartTimes: ["10:00", "10:30", "11:00", "11:30", "12:00"],
  businessCloseTime: "21:00",
  serviceMinutes: 60,
  bufferMinutes: 15,
  requiredSkillKeys: ["body"],
  providerSkillKeys: ["body", "head"],
  weeklyRanges: [{ startTime: "10:00", endTime: "18:00" }],
  exceptions: [],
  occupiedRanges: [],
} as const;

describe("SPA provider availability", () => {
  it("requires every treatment skill", () => {
    expect(calculateSpaProviderStartTimes({ ...base, requiredSkillKeys: ["body", "face"] })).toEqual([]);
  });

  it("includes buffer time when checking existing bookings", () => {
    expect(calculateSpaProviderStartTimes({ ...base, occupiedRanges: [{ startTime: "11:00", durationMinutes: 60 }] })).toEqual(["12:00"]);
  });

  it("closes the entire date for a full-day leave", () => {
    expect(calculateSpaProviderStartTimes({ ...base, exceptions: [{ type: "UNAVAILABLE", startTime: null, endTime: null }] })).toEqual([]);
  });

  it("allows a dated overtime range outside the weekly schedule", () => {
    expect(calculateSpaProviderStartTimes({
      ...base,
      candidateStartTimes: ["18:00", "18:30", "19:00"],
      exceptions: [{ type: "AVAILABLE", startTime: "18:00", endTime: "20:00" }],
    })).toEqual(["18:00", "18:30"]);
  });

  it("rejects starts whose service plus cleanup exceeds closing", () => {
    expect(calculateSpaProviderStartTimes({
      ...base,
      candidateStartTimes: ["19:00", "19:30"],
      businessCloseTime: "20:30",
      weeklyRanges: [{ startTime: "10:00", endTime: "21:00" }],
    })).toEqual(["19:00"]);
  });
});
