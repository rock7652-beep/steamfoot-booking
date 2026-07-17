import { describe, expect, it } from "vitest";
import { buildRecurringPreview, formatBookingWalletOption, recurringWeekOptions } from "@/lib/recurring-booking-preview";

describe("customer recurring booking preview", () => {
  it("limits UI choices to 2 through the store maximum, capped at 8", () => {
    expect(recurringWeekOptions(1)).toEqual([]);
    expect(recurringWeekOptions(5)).toEqual([2, 3, 4, 5]);
    expect(recurringWeekOptions(12)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  it("shows every weekly occurrence and flags only the unavailable date", () => {
    const preview = buildRecurringPreview({
      bookingDate: "2026-07-20",
      weeks: 3,
      slotTime: "20:00",
      people: 2,
      bookableUntil: "2026-08-31",
      slotsByDate: {
        "2026-07-20": [{ startTime: "20:00", capacity: 4, bookedCount: 0, available: 4, isEnabled: true }],
        "2026-07-27": [{ startTime: "20:00", capacity: 4, bookedCount: 4, available: 0, isEnabled: true }],
        "2026-08-03": [{ startTime: "20:00", capacity: 4, bookedCount: 0, available: 4, isEnabled: true }],
      },
    });

    expect(preview).toEqual([
      { date: "2026-07-20", available: true },
      { date: "2026-07-27", available: false, reason: "已額滿" },
      { date: "2026-08-03", available: true },
    ]);
  });

  it("flags dates beyond the store booking horizon before checking slots", () => {
    const preview = buildRecurringPreview({
      bookingDate: "2026-07-20",
      weeks: 2,
      slotTime: "20:00",
      people: 1,
      bookableUntil: "2026-07-20",
      slotsByDate: { "2026-07-20": [] },
    });

    expect(preview[1]).toEqual({ date: "2026-07-27", available: false, reason: "超過最遠可預約日期" });
  });

  it("shows AVAILABLE sessions rather than cached remaining sessions in recurring wallet labels", () => {
    const wallet = {
      planName: "10 堂套餐（Staging）",
      remainingSessions: 5,
      recurringAvailableSessions: 3,
      expiryDate: "2026-08-31",
    };
    const recurringLabel = formatBookingWalletOption(wallet, true);
    const singleLabel = formatBookingWalletOption(wallet, false);

    expect(recurringLabel).toBe("10 堂套餐（Staging）｜可用 3 堂｜到期 2026/08/31");
    expect(recurringLabel).not.toContain("5 堂");
    expect(singleLabel).toBe("10 堂套餐（Staging）（剩 5 堂）");
    expect(singleLabel).not.toContain("可用 3 堂");
  });
});
