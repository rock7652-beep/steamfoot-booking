import { describe, expect, it } from "vitest";
import {
  FEATURES,
  PRICING_PLAN_INFO,
  hasFeature,
  type FeatureKey,
} from "@/lib/feature-flags";
import { MANAGEABLE_STORE_FEATURES } from "@/lib/store-feature-catalog";

function expectUnavailable(plan: "BASIC" | "GROWTH", features: FeatureKey[]) {
  for (const feature of features) {
    expect(hasFeature(plan, feature), `${plan} should not include ${feature}`).toBe(false);
  }
}

describe("plan feature package alignment", () => {
  it("keeps 基本版 tool and management modules as per-store add-ons", () => {
    expectUnavailable("BASIC", [
      FEATURES.LINE_REMINDER,
      FEATURES.CASH_DRAWER,
      FEATURES.DATA_EXPORT,
      FEATURES.CUSTOMER_CARE,
      FEATURES.ADVANCED_REPORTS,
      FEATURES.AI_HEALTH_SUMMARY,
      FEATURES.MEMBER_PORTAL,
      FEATURES.SERVICE_FEE_CALCULATOR,
      FEATURES.MULTI_STORE,
    ]);
  });

  it("includes only the fixed 專業版 store modules by default", () => {
    expect(hasFeature("GROWTH", FEATURES.CASH_DRAWER)).toBe(true);
    expect(hasFeature("GROWTH", FEATURES.CUSTOMER_CARE)).toBe(true);

    expectUnavailable("GROWTH", [
      FEATURES.LINE_REMINDER,
      FEATURES.DATA_EXPORT,
      FEATURES.ADVANCED_REPORTS,
      FEATURES.AI_HEALTH_SUMMARY,
      FEATURES.MEMBER_PORTAL,
      FEATURES.SERVICE_FEE_CALCULATOR,
      FEATURES.MULTI_STORE,
    ]);
  });

  it("includes every HQ-manageable store feature in 展店版", () => {
    for (const feature of MANAGEABLE_STORE_FEATURES) {
      expect(
        hasFeature("ALLIANCE", feature.key),
        `ALLIANCE should include ${feature.key}`,
      ).toBe(true);
    }
  });

  it("uses 展店版 as the ALLIANCE display label", () => {
    expect(PRICING_PLAN_INFO.ALLIANCE.label).toBe("展店版");
  });
});
