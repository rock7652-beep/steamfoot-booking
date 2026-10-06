import { describe, expect, it } from "vitest";
import { resolveNavigationAccess } from "@/lib/navigation-access";
import { isNavigationItemActive } from "@/lib/hq-navigation";
import { isRetiredStoreFeature, MANAGEABLE_STORE_FEATURES } from "@/lib/store-feature-catalog";

describe("navigation presentation keeps entitlement and personnel authorization separate", () => {
  const store = { hq: false, owner: true, permissions: [], permission: "inventory.read", enabled: false };
  it("HQ sees hidden entries with a disabled status", () => {
    expect(resolveNavigationAccess({ ...store, hq: true, state: "HIDDEN" })).toEqual({ visible: true, locked: true, status: "已隱藏" });
  });
  it("HQ sees unavailable entries without an upgrade flow", () => {
    expect(resolveNavigationAccess({ ...store, hq: true, state: "LOCKED" }).status).toBe("未開通");
  });
  it("a backend identity flag does not give a missing personnel grant", () => {
    expect(resolveNavigationAccess({ ...store, enabled: true }).visible).toBe(false);
  });
  it("granted store users still cannot see a hidden feature", () => {
    expect(resolveNavigationAccess({ ...store, permissions: ["inventory.read"], state: "HIDDEN" }).visible).toBe(false);
  });
  it("a locked grant retains its unavailable store presentation", () => {
    expect(resolveNavigationAccess({ ...store, permissions: ["inventory.read"], state: "LOCKED" })).toEqual({ visible: true, locked: true });
  });
  it("retains unknown-feature warnings and does not create a new analysis grant", () => {
    expect(isRetiredStoreFeature("advanced_reports")).toBe(true);
    expect(isRetiredStoreFeature("unknown_reports")).toBe(false);
    expect(isRetiredStoreFeature("basic_reports")).toBe(false);
    expect(MANAGEABLE_STORE_FEATURES.some(item => item.key === "advanced_reports")).toBe(false);
  });
  it("marks the consolidated parent for digital lead deep links", () => {
    expect(isNavigationItemActive("/dashboard/growth", "/dashboard/digital-butler/leads", "", ["/dashboard/growth"])).toBe(true);
  });
  it("keeps explicit HQ lead links active instead of duplicating its parent", () => {
    expect(isNavigationItemActive("/dashboard/growth", "/dashboard/digital-butler/leads", "", ["/dashboard/growth", "/dashboard/digital-butler/leads"])).toBe(false);
  });
  it("marks operations for cashbook deep links without stealing an explicit HQ entry", () => {
    expect(isNavigationItemActive("/dashboard/revenue", "/dashboard/cashbook", "", ["/dashboard/revenue"])).toBe(true);
    expect(isNavigationItemActive("/dashboard/revenue", "/dashboard/cashbook", "", ["/dashboard/revenue", "/dashboard/cashbook"])).toBe(false);
  });
});
