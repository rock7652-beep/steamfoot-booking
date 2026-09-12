import { describe, expect, it } from "vitest";
import {
  createDevicePreviewUrl,
  getDevicePreviewPageForPath,
  normalizeDashboardPath,
  resolveDashboardPreviewPath,
  isPreviewableDashboardPath,
} from "@/lib/device-preview";

describe("device preview route helpers", () => {
  it("maps nested dashboard routes to their most specific quick-navigation item", () => {
    expect(getDevicePreviewPageForPath("/dashboard")).toMatchObject({ id: "dashboard" });
    expect(getDevicePreviewPageForPath("/dashboard/customers/customer-123")).toMatchObject({
      id: "customers",
    });
    expect(getDevicePreviewPageForPath("/dashboard/settings/hours")).toMatchObject({
      id: "settings",
    });
    expect(getDevicePreviewPageForPath("/s/staging/admin/dashboard/customers")).toMatchObject({
      id: "customers",
    });
    expect(getDevicePreviewPageForPath("/s/zhubei/admin/dashboard/plans/plan-123")).toMatchObject({
      id: "plans",
    });
  });

  it("normalizes browser-visible store dashboard routes before feature matching", () => {
    expect(normalizeDashboardPath("/dashboard")).toBe("/dashboard");
    expect(normalizeDashboardPath("/s/staging/admin/dashboard")).toBe("/dashboard");
    expect(normalizeDashboardPath("/s/zhubei/admin/dashboard/customers/123")).toBe(
      "/dashboard/customers/123",
    );
    expect(normalizeDashboardPath("/s/staging/admin/dashboard/revenue")).toBe(
      "/dashboard/revenue",
    );
    expect(normalizeDashboardPath("/s/staging/admin/dashboard/settings")).toBe(
      "/dashboard/settings",
    );
  });

  it("uses the current store scope for quick-navigation destinations", () => {
    expect(
      resolveDashboardPreviewPath("/dashboard/customers", "/s/staging/admin/dashboard/device-preview"),
    ).toBe("/s/staging/admin/dashboard/customers");
    expect(
      resolveDashboardPreviewPath("/dashboard/revenue", "/s/zhubei/admin/dashboard/device-preview"),
    ).toBe("/s/zhubei/admin/dashboard/revenue");
  });

  it("preserves route query state while adding preview mode", () => {
    expect(createDevicePreviewUrl("/dashboard/customers?search=lin")).toBe(
      "/dashboard/customers?search=lin&devicePreview=1",
    );
  });

  it("allows dashboard navigation but blocks recursive preview routes", () => {
    expect(isPreviewableDashboardPath("/dashboard/revenue?page=2")).toBe(true);
    expect(isPreviewableDashboardPath("/dashboard/device-preview")).toBe(false);
    expect(isPreviewableDashboardPath("/pricing")).toBe(false);
  });
});
