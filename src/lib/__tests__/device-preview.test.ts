import { describe, expect, it } from "vitest";
import {
  createDevicePreviewUrl,
  getDevicePreviewPageForPath,
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
