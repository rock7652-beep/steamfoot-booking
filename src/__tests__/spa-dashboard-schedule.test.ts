import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createBookingSchema } from "@/lib/validators/booking";
import {
  resolveSpaProviderBadge,
  resolveSpaScheduleService,
} from "@/lib/spa-dashboard-schedule";

describe("SPA dashboard schedule presentation", () => {
  it("keeps the seeded 60+30+30 composed booking at 120 minutes", () => {
    expect(
      resolveSpaScheduleService({ bookingId: "spa-demo-booking-zhang" }),
    ).toEqual({
      name: "全身精油舒壓＋頭部舒壓＋足部放鬆",
      durationMinutes: 120,
    });
  });

  it("uses the SPA catalog for ordinary plan bookings", () => {
    expect(
      resolveSpaScheduleService({
        bookingId: "future-booking",
        servicePlanName: "新客舒壓體驗 60 分鐘",
      }),
    ).toEqual({
      name: "新客舒壓體驗 60 分鐘",
      durationMinutes: 60,
    });
  });

  it("uses a conservative SPA fallback for an unknown future service", () => {
    expect(resolveSpaScheduleService({ bookingId: "future-booking" })).toEqual({
      name: "SPA 服務",
      durationMinutes: 90,
    });
  });

  it("extracts the therapist number badge", () => {
    expect(resolveSpaProviderBadge("10號 張若琳")).toBe("10");
    expect(resolveSpaProviderBadge("未編號芳療師")).toBe("--");
  });

  it("accepts a server-validated provider when creating from the schedule", () => {
    expect(
      createBookingSchema.parse({
        customerId: "demo-customer",
        bookingDate: "2026-08-29",
        slotTime: "14:30",
        bookingType: "SINGLE",
        serviceStaffId: "spa-demo-staff-10",
      }).serviceStaffId,
    ).toBe("spa-demo-staff-10");
  });

  it("opens the in-place quick booking drawer from an enabled provider cell", () => {
    const source = readFileSync(
      "src/app/(dashboard)/dashboard/bookings/spa-provider-schedule.tsx",
      "utf8",
    );
    expect(source).toContain("onCreate={(time) =>");
    expect(source).toContain("setQuickTarget({ providerId: provider.id, time })");
    expect(source).toContain("<SpaQuickBookingDrawer");
    expect(source).toContain("排預約");
  });

  it("centers daily operations on the current time and actionable states", () => {
    const source = readFileSync(
      "src/app/(dashboard)/dashboard/bookings/spa-provider-schedule.tsx",
      "utf8",
    );

    expect(source).toContain("回到現在");
    expect(source).toContain('aria-label="選擇預約日期"');
    expect(source).toContain("handleDateChange");
    expect(source).toContain("resolveDashboardHref");
    expect(source).toContain("<NowLine");
    expect(source).toContain("一小時內");
    expect(source).toContain("待結帳");
    expect(source).toContain("按摩床可用");
    expect(source).toContain("spaOperationalStatus");
  });
});
