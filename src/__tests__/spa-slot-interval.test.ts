import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  generateSlots,
  SLOT_INTERVAL_OPTIONS,
  validateTimeRange,
} from "@/lib/slot-generator";

describe("SPA 15/30 minute booking units", () => {
  it("supports 15-minute starts without changing the existing 30-minute option", () => {
    expect(SLOT_INTERVAL_OPTIONS.map((option) => option.value)).toEqual(
      expect.arrayContaining([15, 30]),
    );
    expect(generateSlots("10:00", "11:00", 15, 1).map((slot) => slot.startTime)).toEqual([
      "10:00",
      "10:15",
      "10:30",
      "10:45",
    ]);
  });

  it("accepts 15 minutes as a persisted business-hours interval", () => {
    expect(validateTimeRange({
      openTime: "10:00",
      closeTime: "21:00",
      slotInterval: 15,
      defaultCapacity: 1,
    })).toEqual({ valid: true });
  });

  it("keeps the time-unit setting discoverable from the SPA schedule and settings", () => {
    const schedule = readFileSync(
      "src/app/(dashboard)/dashboard/bookings/spa-provider-schedule.tsx",
      "utf8",
    );
    const settings = readFileSync(
      "src/app/(dashboard)/dashboard/settings/page.tsx",
      "utf8",
    );

    expect(schedule).toContain("設定 15／30 分鐘");
    expect(schedule).toContain("/dashboard/settings/hours");
    expect(settings).toContain("營業與預約時間");
  });
});
