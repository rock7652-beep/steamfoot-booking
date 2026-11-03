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

  it("refuses to route a retired module into an active booking runtime", () => {
    expect(()=>bookingDashboardPath("spa")).toThrow("SPA 模組已移除");
    expect(()=>bookingDashboardPathForStoreModule("spa")).toThrow("SPA 模組已移除");
    expect(bookingDashboardPath("course")).toBe("/dashboard/courses");
    expect(bookingDashboardPath("beauty")).toBe("/dashboard/beauty");
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

  it("blocks old SPA schedule and home store access before active dashboard queries", async () => {
    const {isRetiredModuleRoute}=await import("@/lib/retired-module-routes");
    expect(isRetiredModuleRoute("/s/old/admin/dashboard/spa-schedule",new URLSearchParams())).toBe(true);
    const proxy=readFileSync("src/proxy.ts","utf8");
    expect(proxy).toContain("retiredStoreBoundary");
    const dashboard=readFileSync("src/app/(dashboard)/dashboard/page.tsx","utf8");
    expect(dashboard).not.toContain("SpaHome");
    expect(dashboard).not.toContain("spa-db");
  });
});
