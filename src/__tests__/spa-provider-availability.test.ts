import { describe, expect, it } from "vitest";
import {
  isSpaProviderAvailable,
  type SpaBookableProvider,
} from "@/lib/spa-provider-availability";

const provider: SpaBookableProvider = {
  id: "staff-07",
  label: "07號 技師",
  specialties: ["body"],
  weeklyAvailability: [{ dayOfWeek: 0, startTime: "10:00", endTime: "18:00" }],
  availabilityExceptions: [],
  occupiedRanges: [],
};

describe("SPA provider availability", () => {
  it("requires the complete service and buffer to fit inside the weekly schedule", () => {
    expect(isSpaProviderAvailable({
      provider,
      date: "2026-08-30",
      startTime: "16:30",
      serviceMinutes: 60,
    })).toBe(true);
    expect(isSpaProviderAvailable({
      provider,
      date: "2026-08-30",
      startTime: "17:00",
      serviceMinutes: 60,
    })).toBe(false);
  });

  it("blocks a full-day leave exception", () => {
    expect(isSpaProviderAvailable({
      provider: {
        ...provider,
        availabilityExceptions: [{
          date: "2026-08-30",
          type: "UNAVAILABLE",
          startTime: null,
          endTime: null,
        }],
      },
      date: "2026-08-30",
      startTime: "10:00",
      serviceMinutes: 60,
    })).toBe(false);
  });

  it("allows a dated overtime interval outside the regular schedule", () => {
    expect(isSpaProviderAvailable({
      provider: {
        ...provider,
        availabilityExceptions: [{
          date: "2026-08-31",
          type: "AVAILABLE",
          startTime: "13:00",
          endTime: "16:00",
        }],
      },
      date: "2026-08-31",
      startTime: "13:00",
      serviceMinutes: 90,
    })).toBe(true);
  });

  it("rejects overlapping bookings on the selected date only", () => {
    const occupiedProvider: SpaBookableProvider = {
      ...provider,
      occupiedRanges: [
        { date: "2026-08-30", startTime: "13:00", durationMinutes: 90 },
        { date: "2026-08-31", startTime: "10:00", durationMinutes: 90 },
      ],
    };
    expect(isSpaProviderAvailable({
      provider: occupiedProvider,
      date: "2026-08-30",
      startTime: "13:30",
      serviceMinutes: 60,
    })).toBe(false);
    expect(isSpaProviderAvailable({
      provider: occupiedProvider,
      date: "2026-08-30",
      startTime: "10:00",
      serviceMinutes: 60,
    })).toBe(true);
  });
});
