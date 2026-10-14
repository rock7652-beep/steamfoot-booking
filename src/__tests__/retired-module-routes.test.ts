import { describe, expect, it } from "vitest";
import { isRetiredModuleRoute } from "@/lib/retired-module-routes";

describe("SPA retirement routes", () => {
  it.each([
    "/spa-preview/manager", "/staff-login", "/staff-schedule",
    "/s/demo/liff/spa-work", "/s/demo/staff/login", "/s/demo/staff/my-bookings", "/s/demo/admin/dashboard/spa-schedule",
    "/hq/dashboard/spa-resources", "/api/spa/settings/service",
    "/s/demo/admin/dashboard/settings-save/spa/package",
    "/api/cron/spa-demo-reminders", "/api/export/spa-analysis", "/pricing/features/services/",
  ])("blocks old SPA entry %s", path => {
    expect(isRetiredModuleRoute(path, new URLSearchParams())).toBe(true);
  });
  it.each(["module=spa", "theme=spa"])("blocks SPA previews %s", query => {
    expect(isRetiredModuleRoute("/pricing/header-review", new URLSearchParams(query))).toBe(true);
  });
  it.each([
    "/pricing/features/slots", "/pricing/features/music", "/pricing/features/fitness",
    "/s/steam/admin/dashboard/bookings", "/s/music/admin/dashboard/courses",
    "/api/course/settings/staff", "/api/settings/service-hours",
    "/spa-preview-other", "/dashboard/spa-staff-other",
  ])("preserves supported entry %s", path => {
    expect(isRetiredModuleRoute(path, new URLSearchParams())).toBe(false);
  });
});
