import { describe, expect, it } from "vitest";
import { FEATURES, hasFeature } from "@/lib/feature-flags";
import { resolveStoreFeatureDisplayState } from "@/lib/store-feature-catalog";

describe("independent analysis addon", () => {
  for (const plan of ["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"] as const) {
    it(`${plan} requires an explicit grant and respects disable and expiry`, () => {
      expect(hasFeature(plan, FEATURES.BASIC_REPORTS)).toBe(false);
      const now = new Date("2026-09-08T00:00:00Z");
      const grant = { status: "ENABLED" as const, source: "ADDON" as const, startsAt: null, expiresAt: null };
      expect(resolveStoreFeatureDisplayState(plan, FEATURES.BASIC_REPORTS, grant, now).effectiveAllowed).toBe(true);
      expect(resolveStoreFeatureDisplayState(plan, FEATURES.BASIC_REPORTS, { ...grant, status: "DISABLED" }, now).effectiveAllowed).toBe(false);
      expect(resolveStoreFeatureDisplayState(plan, FEATURES.BASIC_REPORTS, { ...grant, expiresAt: new Date("2026-09-01T00:00:00Z") }, now).effectiveAllowed).toBe(false);
    });
  }
});
