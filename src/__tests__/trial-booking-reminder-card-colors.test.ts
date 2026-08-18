import { describe, expect, it } from "vitest";
import {
  buildPackageBookingReminderLineMessages,
  buildTrialBookingReminderLineMessages,
} from "@/server/services/trial-booking-reminder-line-message";

type FlexBox = {
  backgroundColor?: string;
  contents: Array<{
    style?: string;
    color?: string;
    action?: { label?: string };
  }>;
};

function flexContents(message: ReturnType<typeof buildTrialBookingReminderLineMessages>[number]) {
  expect(message.type).toBe("flex");
  if (message.type !== "flex") throw new Error("Expected a Flex message");
  return message.contents as {
    header: FlexBox;
    body: FlexBox;
    footer: FlexBox;
  };
}

describe("LINE reminder card colors", () => {
  it("uses one warm brand palette for package reminders", () => {
    const [message] = buildPackageBookingReminderLineMessages({
      customerName: "黃彥陸",
      bookingDate: "2026-08-19",
      bookingTime: "14:00",
      shopName: "暖暖蒸足",
      serviceName: "方案預約",
      serviceDuration: "45 分鐘",
      mapUrl: "https://maps.google.com/?q=暖暖蒸足",
    }, "https://www.steamfoot.com/s/zhubei/my-bookings", "booking-1");

    const card = flexContents(message);
    expect(card.header.backgroundColor).toBe("#F3EDE5");
    expect(card.footer.contents.map(({ style, color }) => ({ style, color }))).toEqual([
      { style: "primary", color: "#667A5C" },
      { style: "primary", color: "#8B6B52" },
      { style: "primary", color: "#AD5F58" },
    ]);
  });

  it("uses the same palette and white-label button style for first-trial reminders", () => {
    const [message] = buildTrialBookingReminderLineMessages({
      customerName: "test",
      bookingDate: "2026-08-19",
      bookingTime: "15:00",
      shopName: "竹北店",
      serviceName: "首次體驗",
      reminderText: "請穿著輕便服裝，提前 10 分鐘抵達。",
      mapUrl: "https://maps.app.goo.gl/example",
    }, "https://www.steamfoot.com/trial-booking/manage?token=signed");

    const card = flexContents(message);
    expect(card.header.backgroundColor).toBe("#F3EDE5");
    expect(card.footer.contents.map(({ action, style, color }) => ({
      label: action?.label,
      style,
      color,
    }))).toEqual([
      { label: "開啟 Google Maps 導航", style: "primary", color: "#667A5C" },
      { label: "確認會到", style: "primary", color: "#667A5C" },
      { label: "需要改期", style: "primary", color: "#8B6B52" },
      { label: "取消預約", style: "primary", color: "#AD5F58" },
    ]);
    expect(JSON.stringify(card.body)).toContain("請穿著輕便服裝，提前 10 分鐘抵達。");
  });
});
