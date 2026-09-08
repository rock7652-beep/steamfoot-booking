import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bookingDashboardPath,
  bookingDashboardPathForStoreModule,
} from "@/lib/industry-dashboard-routes";

describe("Steamfoot and SPA booking route isolation", () => {
  it.each(["zhubei", "hsinchu", "taichung"])(
    "keeps the %s Steamfoot store on the original booking route",
    () => {
      expect(bookingDashboardPath("steamfoot")).toBe("/dashboard/bookings");
      expect(bookingDashboardPathForStoreModule("steamfoot")).toBe(
        "/dashboard/bookings",
      );
    },
  );

  it("routes SPA to its own schedule entry", () => {
    expect(bookingDashboardPath("spa")).toBe("/dashboard/spa-schedule");
    expect(bookingDashboardPathForStoreModule("spa")).toBe(
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

  it("scopes every SPA schedule query to the authorized current SPA store", () => {
    const spaPage = readFileSync(
      "src/app/(dashboard)/dashboard/spa-schedule/page.tsx",
      "utf8",
    );
    expect(spaPage).toContain("await requireSpaStore(storeId)");
    expect(spaPage).toContain("getMonthBookingSummary(year, month, storeId)");
    expect(spaPage).toContain("where: { storeId }");
    expect(spaPage).not.toContain("SPA_DEMO_STORE");

    const spaSchedule = readFileSync(
      "src/app/(dashboard)/dashboard/bookings/spa-provider-schedule.tsx",
      "utf8",
    );
    expect(spaSchedule).not.toContain("/dashboard/bookings");
  });

  it("routes every SPA store home into the SPA schedule", () => {
    const dashboard = readFileSync(
      "src/app/(dashboard)/dashboard/page.tsx",
      "utf8",
    );
    expect(dashboard).toContain('getStoreIndustryModule(activeStoreId)');
    expect(dashboard).toContain('redirect("/dashboard/spa-schedule")');
  });
});
