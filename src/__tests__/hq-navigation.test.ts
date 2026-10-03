import { describe, expect, it } from "vitest";
import { hqStoreSwitchDestination, isHqPlatformPath, isNavigationItemActive } from "@/lib/hq-navigation";

describe("HQ store navigation", () => {
  it.each(["", "?page=frontend-preview&device=tablet", "?view=analytics&store=old"])("resets stale page context when switching (%s)", search => {
    expect(hqStoreSwitchDestination(search)).toBe("/hq/dashboard");
  });
  it("retains the device iframe's embedded mode", () => {
    expect(hqStoreSwitchDestination("?view=plans&devicePreview=1")).toBe("/hq/dashboard?devicePreview=1");
  });
  it.each(["/hq/dashboard/stores", "/hq/dashboard/stores/a/features", "/hq/dashboard/stores/subscriptions", "/hq/dashboard/trial-applications"])("keeps platform navigation on %s", path => expect(isHqPlatformPath(path)).toBe(true));
  it.each(["/hq/dashboard", "/hq/dashboard/courses", "/hq/dashboard/stores-other", "/s/course/admin/dashboard"])("does not treat %s as platform management", path => expect(isHqPlatformPath(path)).toBe(false));
  it("highlights only the nested subscription item", () => {
    const links = ["/dashboard/stores", "/dashboard/stores/subscriptions", "/dashboard/stores/organization"];
    expect(links.filter(href => isNavigationItemActive(href, "/dashboard/stores/subscriptions/a", "", links))).toEqual([links[1]]);
  });
  it("highlights store details under the store list", () => {
    expect(isNavigationItemActive("/dashboard/stores", "/dashboard/stores/a/features", "", ["/dashboard/stores", "/dashboard/stores/subscriptions"])).toBe(true);
  });
  it("distinguishes course tabs", () => {
    expect(isNavigationItemActive("/dashboard/courses?view=plans", "/dashboard/courses", "view=customers", [])).toBe(false);
    expect(isNavigationItemActive("/dashboard/courses?view=plans", "/dashboard/courses", "view=plans", [])).toBe(true);
    expect(isNavigationItemActive("/dashboard/courses", "/dashboard/courses", "", [])).toBe(true);
  });
});
