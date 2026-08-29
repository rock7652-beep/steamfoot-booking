import { describe, expect, it } from "vitest";
import { isSpaResourceAvailable } from "@/lib/spa-resource-availability";

describe("SPA room resource availability", () => {
  const occupiedRanges = [
    { startTime: "10:00", durationMinutes: 90, resourceType: "BED" as const },
    { startTime: "10:30", durationMinutes: 60, resourceType: "BED" as const },
  ];

  it("blocks a request while every bed is concurrently occupied", () => {
    expect(isSpaResourceAvailable({ startTime: "10:45", durationMinutes: 30, resourceType: "BED", capacity: 2, occupiedRanges })).toBe(false);
  });

  it("keeps chair capacity independent from bed capacity", () => {
    expect(isSpaResourceAvailable({ startTime: "10:45", durationMinutes: 30, resourceType: "CHAIR", capacity: 2, occupiedRanges })).toBe(true);
  });
});
