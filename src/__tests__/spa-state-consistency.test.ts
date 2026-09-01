import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getCurrentSpaDemoNotification,
  getSpaDemoManagerReminders,
  SPA_DEMO_LIVE_FLOW_BOOKING_ID,
  type SpaDemoBooking,
  type SpaDemoBookingNotification,
} from "@/lib/spa-demo-store";
import { canCompleteSpaBooking } from "@/lib/spa-booking-completion";

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
  it("blocks completion before the Taipei appointment start time", () => {
    expect(canCompleteSpaBooking("2026-09-01", "15:30", new Date("2026-09-01T07:29:59.000Z"))).toBe(false);
    expect(canCompleteSpaBooking("2026-09-01", "15:30", new Date("2026-09-01T07:30:00.000Z"))).toBe(true);
    expect(canCompleteSpaBooking("2026-09-01", "15:30", new Date("2026-09-01T08:00:00.000Z"))).toBe(true);
  });

  it("hides stale reminders and notifications for completed bookings", () => {
    expect(getCurrentSpaDemoNotification(reminder, [activeBooking], "2026-09-01")).toEqual(reminder);
    expect(getCurrentSpaDemoNotification({ ...reminder, date: "2026-09-01" }, [activeBooking], "2026-09-01")).toBeNull();
    expect(getCurrentSpaDemoNotification(reminder, [{ ...activeBooking, status: "已完成" }], "2026-09-01")).toBeNull();
  });

  it("only shows manager reminders for actionable bookings today", () => {
    expect(getSpaDemoManagerReminders([{ ...activeBooking, date: "2026-09-01", status: "新客體驗" }], "2026-09-01", "2026-09-01"))
      .toEqual([{ title: "新客首次到店", detail: "服務前確認注意事項", tone: "rose" }]);
    expect(getSpaDemoManagerReminders([{ ...activeBooking, date: "2026-09-01", status: "已完成" }], "2026-09-01", "2026-09-01")).toEqual([]);
    expect(getSpaDemoManagerReminders([{ ...activeBooking, date: "2026-09-01", status: "新客體驗", refundedAt: "2026-09-01T08:00:00.000Z" }], "2026-09-01", "2026-09-01")).toEqual([]);
    expect(getSpaDemoManagerReminders([{ ...activeBooking, date: "2026-09-01", status: "新客體驗" }], "2026-08-31", "2026-09-01")).toEqual([]);
  });

  it("enforces the appointment-time guard in both checkout actions and the manager UI", () => {
    const checkout = readFileSync("src/server/actions/spa-demo-checkout.ts", "utf8");
    const manager = readFileSync("src/app/(liff)/liff/_components/spa-manager-schedule-preview.tsx", "utf8");
    expect(checkout.match(/canCompleteSpaBooking/g)).toHaveLength(3);
    expect(checkout).toContain("尚未到，暫時不能完成服務或結帳");
    expect(manager).toContain("canCompleteService={canCompleteSpaBooking");
    expect(manager).toContain("disabled={!canCompleteService}");
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
