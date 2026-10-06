import { describe, it, expect } from "vitest";
import { FEATURES, requireFeature } from "@/lib/feature-flags";
import { getPaidAddon } from "@/lib/paid-addon";
describe("paid add-on guidance", () => {
  it.each([FEATURES.INVENTORY, FEATURES.WORK_ORDERS])("%s requires an add-on instead of an alliance upgrade", feature => {
    const copy = getPaidAddon(feature);
    expect(copy?.title).toContain("需額外加購");
    expect(copy?.retention).toContain("原有資料仍保留");
    for (const plan of ["BASIC", "GROWTH", "ALLIANCE"] as const) {
      expect(() => requireFeature(plan, feature)).toThrow("此功能需額外加購");
    }
  });
  it("retains plan upgrade guidance for ordinary features", () => {
    expect(getPaidAddon(FEATURES.MULTI_STORE)).toBeNull();
    expect(() => requireFeature("BASIC", FEATURES.MULTI_STORE)).toThrow("展店版");
  });
});
