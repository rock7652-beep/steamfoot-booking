import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bookingDashboardPath,
  bookingDashboardPathForStore,
} from "@/lib/industry-dashboard-routes";

describe("Steamfoot and SPA booking route isolation", () => {
  it.each(["zhubei", "hsinchu", "taichung"])(
    "keeps the %s Steamfoot store on the original booking route",
    () => {
      expect(bookingDashboardPath("steamfoot")).toBe("/dashboard/bookings");
      expect(bookingDashboardPathForStore("formal-store")).toBe(
        "/dashboard/bookings",
      );
    },
  );

  it("routes SPA to its own schedule entry", () => {
    expect(bookingDashboardPath("spa")).toBe("/dashboard/spa-schedule");
    expect(bookingDashboardPathForStore("demo-store")).toBe(
      "/dashboard/spa-schedule",
    );
  });

  it("keeps the Steamfoot booking page free of SPA UI and queries", () => {
    const steamfootPage = readFileSync(
      "src/app/(dashboard)/dashboard/bookings/page.tsx",
      "utf8",
    );
    expect(steamfootPage).not.toContain("SpaProviderSchedule");
    expect(steamfootPage).not.toContain("isSpaDemoStore");
    expect(steamfootPage).not.toContain("SPA_DEMO_PROVIDERS");
    expect(steamfootPage).not.toContain("prisma.treatment");
    expect(steamfootPage).not.toContain("prisma.staff.findMany");
  });

  it("pins every SPA schedule data query to the isolated Demo store", () => {
    const spaPage = readFileSync(
      "src/app/(dashboard)/dashboard/spa-schedule/page.tsx",
      "utf8",
    );
    expect(spaPage).toContain("storeId !== SPA_DEMO_STORE.id");
    expect(spaPage).toContain("assertSpaDemoStoreIdentity(identity)");
    expect(spaPage).toContain("getMonthBookingSummary(year, month, SPA_DEMO_STORE.id)");
    expect(spaPage).not.toContain("storeId: activeStoreId");

    const spaSchedule = readFileSync(
      "src/app/(dashboard)/dashboard/bookings/spa-provider-schedule.tsx",
      "utf8",
    );
    expect(spaSchedule).not.toContain("/dashboard/bookings");
  });
});
