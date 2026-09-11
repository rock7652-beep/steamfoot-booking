import { describe, expect, it } from "vitest";
import { buildPackageBookingReminderLineMessages } from "@/server/services/trial-booking-reminder-line-message";

describe("recurring booking reminder card", () => {
  it("marks the individual occurrence without changing its self-service actions", () => {
    const messages = buildPackageBookingReminderLineMessages({
      customerName: "測試顧客",
      bookingDate: "2026-09-02",
      bookingTime: "18:00",
      shopName: "暖暖蒸足",
      serviceName: "方案預約",
      serviceDuration: "45 分鐘",
      recurrenceIndex: 2,
      recurrenceTotalOccurrences: 4,
    }, "https://example.com/bookings", "booking-2");
    const body = JSON.stringify(messages);
    expect(body).toContain("每週固定預約・第 2/4 次");
    expect(body).toContain("booking-2/reschedule");
    expect(body).toContain("booking-2/cancel");
  });
});
