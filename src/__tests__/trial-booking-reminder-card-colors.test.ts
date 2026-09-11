import { describe, expect, it } from "vitest";
import {
  buildPackageBookingReminderLineMessages,
  buildTrialBookingReminderLineMessages,
} from "@/server/services/trial-booking-reminder-line-message";

type FlexBox = {
  backgroundColor?: string;
  contents: Array<{
    contents?: FlexBox["contents"];
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
  it("uses the green brand palette for package reminders", () => {
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
    expect(card.header.backgroundColor).toBe("#153F33");
    expect(card.footer.contents.flatMap((item) => item.contents ?? [item]).map(({ style, color }) => ({ style, color }))).toEqual([
      { style: "primary", color: "#153F33" },
      { style: "link", color: "#153F33" },
      { style: "link", color: "#666666" },
    ]);
  });

  it("uses the same palette and clear action hierarchy for first-trial reminders", () => {
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
    expect(card.header.backgroundColor).toBe("#153F33");
    expect(card.footer.contents.flatMap((item) => item.contents ?? [item]).map(({ action, style, color }) => ({
      label: action?.label,
      style,
      color,
    }))).toEqual([
      { label: "開啟 Google Maps 導航", style: "primary", color: "#153F33" },
      { label: "確認會到", style: "primary", color: "#153F33" },
      { label: "需要改期", style: "link", color: "#153F33" },
      { label: "取消預約", style: "link", color: "#666666" },
    ]);
    expect(JSON.stringify(card.body)).toContain("請穿著輕便服裝，提前 10 分鐘抵達。");
  });
});
