import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getCurrentSpaDemoNotification,
  SPA_DEMO_LIVE_FLOW_BOOKING_ID,
  type SpaDemoBooking,
  type SpaDemoBookingNotification,
} from "@/lib/spa-demo-store";

const activeBooking: SpaDemoBooking = {
  id: SPA_DEMO_LIVE_FLOW_BOOKING_ID,
  date: "2026-09-02",
  time: "15:30",
  customer: "彥陸",
  service: "全身精油舒壓",
  serviceItems: ["全身精油舒壓"],
  providerId: "spa-demo-staff-08",
  durationMinutes: 60,
  bufferMinutes: 30,
  status: "已確認",
  tone: "sage",
  remainingSessions: 5,
  note: "",
};

const reminder: SpaDemoBookingNotification = {
  kind: "REMINDER",
  title: "明日預約提醒",
  date: "2026-09-02",
  time: "15:30",
  lines: ["第 1 位・全身精油舒壓・60 分鐘"],
  summary: "共 1 位・期待明天見",
};

describe("SPA three-party state consistency", () => {
  it("hides stale reminders and notifications for completed bookings", () => {
    expect(getCurrentSpaDemoNotification(reminder, [activeBooking], "2026-09-01")).toEqual(reminder);
    expect(getCurrentSpaDemoNotification({ ...reminder, date: "2026-09-01" }, [activeBooking], "2026-09-01")).toBeNull();
    expect(getCurrentSpaDemoNotification(reminder, [{ ...activeBooking, status: "已完成" }], "2026-09-01")).toBeNull();
  });

  it("keeps customer preview subpages inside the independent SPA entry", () => {
    const home = readFileSync("src/app/(liff)/liff/design-preview/page.tsx", "utf8");
    const shell = readFileSync("src/app/(liff)/liff/liff-shell.tsx", "utf8");
    expect(home).toContain('section === "bookings" || section === "wallets" || section === "profile"');
    expect(home).toContain("memberLinks={{");
    expect(shell).toContain("resolvedMemberLinks.bookings");
    expect(shell).toContain("resolvedMemberLinks.wallets");
    expect(shell).toContain("resolvedMemberLinks.profile");
  });

  it("starts a new booking after the previous group is completed or refunded", () => {
    const bookingPage = readFileSync("src/app/(liff)/liff/design-preview/booking/page.tsx", "utf8");
    expect(bookingPage).toContain('booking.status !== "已完成"');
    expect(bookingPage).toContain("activeLiveBookings.length ?");
  });

  it("marks overdue appointments for follow-up and blocks new historical bookings", () => {
    const query = readFileSync("src/server/queries/spa-demo-preview.ts", "utf8");
    const manager = readFileSync("src/app/(liff)/liff/_components/spa-manager-schedule-preview.tsx", "utf8");
    expect(query).toContain('bookingDate < today && originalStatus !== "已完成"');
    expect(query).toContain('"待補登"');
    expect(manager).toContain("allowNewBooking={selectedDay.key >= previewDate}");
    expect(manager).toContain("歷史日期僅供查詢與補登，無法新增預約");
  });
});
