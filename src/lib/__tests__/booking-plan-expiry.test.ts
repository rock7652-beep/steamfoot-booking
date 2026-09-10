import { describe, it, expect, vi } from "vitest";
import { bookingPlanExpiry as expiry } from "../booking-plan-expiry";

describe("booking plan expiry display", () => {
  it("marks today, the inclusive 14-day threshold, and expired dates", () => {
    expect(expiry("2026-09-10", "2026-09-10").detail).toBe("2026/09/10（今日到期）");
    expect(expiry("2026-09-24", "2026-09-10").className).toBe("text-amber-700");
    expect(expiry("2026-09-25", "2026-09-10").className).toBe("text-earth-500");
    expect(expiry("2026-09-09", "2026-09-10").className).toBe("text-red-700");
  });
  it("keeps the year for cross-year dates and accepts database Dates", () => {
    expect(expiry(new Date("2027-01-01T00:00:00Z"), "2026-09-10").compact).toBe("2027/01/01 到期");
    expect(expiry("2026-09-30", "2026-09-10").compact).toBe("09/30 到期");
  });
  it("distinguishes unlimited from missing or invalid data", () => {
    expect(expiry(null).detail).toBe("無到期限制");
    expect(expiry(undefined).detail).toBe("到期日待確認");
    expect(expiry("invalid").detail).toBe("到期日待確認");
  });
  it("uses the Taiwan business date at UTC midnight boundaries", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-09T16:01:00Z"));
      expect(expiry("2026-09-10").detail).toBe("2026/09/10（今日到期）");
    } finally { vi.useRealTimers(); }
  });
});
