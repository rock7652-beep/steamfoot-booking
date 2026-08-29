import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSpaQuickAlternatives } from "@/lib/spa-quick-alternatives";

describe("SPA quick booking", () => {
  it("recommends the same time with another provider before moving later", () => {
    expect(buildSpaQuickAlternatives({
      requestedProviderId: "staff-10",
      requestedTime: "14:00",
      providers: [
        { id: "staff-10", displayName: "10號", startTimes: ["14:30", "15:00"] },
        { id: "staff-08", displayName: "08號", startTimes: ["14:00", "14:30"] },
      ],
    })).toEqual([
      { providerId: "staff-08", providerName: "08號", time: "14:00" },
      { providerId: "staff-10", providerName: "10號", time: "14:30" },
      { providerId: "staff-10", providerName: "10號", time: "15:00" },
    ]);
  });

  it("opens an in-place drawer and keeps booking writes behind the SPA Demo boundary", () => {
    const schedule = readFileSync(
      "src/app/(dashboard)/dashboard/bookings/spa-provider-schedule.tsx",
      "utf8",
    );
    const action = readFileSync("src/server/actions/spa-quick-booking.ts", "utf8");
    expect(schedule).toContain("<SpaQuickBookingDrawer");
    expect(action).toContain("currentStoreId(user) !== SPA_DEMO_STORE.id");
    expect(action).toContain("bookingType: \"SINGLE\"");
  });

  it("locks 15-minute SPA ranges at the configured granularity", () => {
    const bookingAction = readFileSync("src/server/actions/booking.ts", "utf8");
    expect(bookingAction).toContain("dayCtx.rule.slotInterval === 15 ? 15 : 30");
    expect(bookingAction).toContain("index * spaLockInterval");
  });
});
