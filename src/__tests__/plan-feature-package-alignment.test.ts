import { describe, expect, it } from "vitest";
import {
  FEATURES,
  PRICING_PLAN_INFO,
  hasFeature,
  type FeatureKey,
  getRequiredPlan,
} from "@/lib/feature-flags";
import { MANAGEABLE_STORE_FEATURES } from "@/lib/store-feature-catalog";
import { resolveEffectiveEntitlement } from "@/lib/effective-entitlement";

function expectUnavailable(plan: "BASIC" | "GROWTH", features: FeatureKey[]) {
  for (const feature of features) {
    expect(hasFeature(plan, feature), `${plan} should not include ${feature}`).toBe(false);
  }
}

describe("plan feature package alignment", () => {
  it.each(["BASIC", "GROWTH", "ALLIANCE"] as const)("includes LIFF in %s but respects a store disable override", (plan) => {
    const included = hasFeature(plan, FEATURES.MEMBER_PORTAL);
    expect(included).toBe(true);
    expect(resolveEffectiveEntitlement(included, null).enabled).toBe(true);
    expect(resolveEffectiveEntitlement(included, {
      status: "DISABLED", startsAt: null, expiresAt: null,
    }).enabled).toBe(false);
  });

  it("includes every single-store feature in the trial plan", () => {
    const excluded = new Set<FeatureKey>();
    for (const feature of Object.values(FEATURES)) {
      expect(hasFeature("EXPERIENCE", feature), feature).toBe(!excluded.has(feature));
    }
  });
  it("suggests paid upgrades instead of downgrading to the trial", () => {
    expect(getRequiredPlan(FEATURES.CUSTOMER_CARE)).toBe("GROWTH");
    expect(getRequiredPlan(FEATURES.MULTI_STORE)).toBe("ALLIANCE");
  });
  it("keeps 基本版 tool and management modules as per-store add-ons", () => {
    expectUnavailable("BASIC", [
      FEATURES.CASH_DRAWER,
      FEATURES.DATA_EXPORT,
      FEATURES.CUSTOMER_CARE,
      FEATURES.ADVANCED_REPORTS,
      FEATURES.AI_HEALTH_SUMMARY,
      FEATURES.SERVICE_FEE_CALCULATOR,
      FEATURES.MULTI_STORE,
    ]);
  });

  it("includes only the fixed 專業版 store modules by default", () => {
    expect(hasFeature("GROWTH", FEATURES.CASH_DRAWER)).toBe(true);
    expect(hasFeature("GROWTH", FEATURES.CUSTOMER_CARE)).toBe(true);

    expectUnavailable("GROWTH", [
      FEATURES.DATA_EXPORT,
      FEATURES.ADVANCED_REPORTS,
      FEATURES.AI_HEALTH_SUMMARY,
      FEATURES.SERVICE_FEE_CALCULATOR,
      FEATURES.MULTI_STORE,
    ]);
  });

  it("includes every plan-managed HQ feature in 展店版 while Digital Butler remains entitlement-only", () => {
    for (const feature of MANAGEABLE_STORE_FEATURES.filter(
      (feature) => !(new Set<FeatureKey>([FEATURES.DIGITAL_BUTLER, FEATURES.ADVANCED_REPORTS, FEATURES.FRONTEND_PREVIEW, FEATURES.WORK_ORDERS])).has(feature.key),
    )) {
      expect(
        hasFeature("ALLIANCE", feature.key),
        `ALLIANCE should include ${feature.key}`,
      ).toBe(true);
    }
    for (const feature of [FEATURES.DIGITAL_BUTLER, FEATURES.ADVANCED_REPORTS, FEATURES.FRONTEND_PREVIEW, FEATURES.WORK_ORDERS]) {
      expect(hasFeature("ALLIANCE", feature)).toBe(false);
    }
  });

  it.each(["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"] as const)("resolves analysis plan defaults and store overrides for %s", (plan) => {
    const included = hasFeature(plan, FEATURES.BASIC_REPORTS);
    expect(included).toBe(plan !== "BASIC");
    expect(resolveEffectiveEntitlement(included, null).enabled).toBe(included);
    expect(resolveEffectiveEntitlement(included, { status: "ENABLED", startsAt: null, expiresAt: null }).enabled).toBe(true);
    expect(resolveEffectiveEntitlement(included, { status: "DISABLED", startsAt: null, expiresAt: null }).enabled).toBe(false);
    expect(resolveEffectiveEntitlement(included, { status: "ENABLED", startsAt: null, expiresAt: new Date("2000-01-01") }).enabled).toBe(included);
  });

  it.each(["BASIC", "GROWTH", "ALLIANCE"] as const)("includes reminders and labels and preserves HQ overrides for %s", plan => {
    for (const feature of [FEATURES.LINE_REMINDER, FEATURES.CUSTOMER_LABELS]) {
      expect(hasFeature(plan, feature)).toBe(true);
      for (const status of ["DISABLED", "LOCKED", "HIDDEN"] as const) {
        expect(resolveEffectiveEntitlement(true, { status, startsAt: null, expiresAt: null }).enabled).toBe(false);
      }
    }
    expect(hasFeature(plan, FEATURES.INVENTORY)).toBe(plan === "ALLIANCE");
    expect(resolveEffectiveEntitlement(hasFeature(plan, FEATURES.INVENTORY), { status: "ENABLED", startsAt: null, expiresAt: null }).enabled).toBe(true);
  });

  it("uses 展店版 as the ALLIANCE display label", () => {
    expect(PRICING_PLAN_INFO.ALLIANCE.label).toBe("展店版");
  });
});
