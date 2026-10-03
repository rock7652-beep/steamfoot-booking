import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ store: vi.fn(), industry: vi.fn(), entitlement: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/db", () => ({ prisma: { storeFeatureEntitlement: { findUnique: m.entitlement } } }));
vi.mock("@/lib/store-plan", () => ({ getStoreForPlanByStoreId: m.store, getCurrentStoreForPlan: m.store }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: m.industry }));
import { hasStoreFeature, getStoreFeaturePresentation, requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
beforeEach(() => { vi.clearAllMocks(); m.store.mockResolvedValue({ id: "test-store", plan: "EXPERIENCE", planStatus: "ACTIVE" }); m.industry.mockResolvedValue("course"); m.entitlement.mockResolvedValue(null); });
describe("course trial availability", () => {
  it("includes frontend preview before the course trial countdown starts", async () => {
    expect(await hasStoreFeature("test-store", FEATURES.FRONTEND_PREVIEW)).toBe(true);
    expect(await getStoreFeaturePresentation("test-store", FEATURES.FRONTEND_PREVIEW)).toBe("ENABLED");
  });
  it.each(["steamfoot", "spa", "course"])("includes preview for dated %s single-store trials", async industry => {
    m.industry.mockResolvedValue(industry);
    m.store.mockResolvedValue({ plan: "EXPERIENCE", planStatus: "TRIAL", planEffectiveAt: new Date("2026-09-18"), planExpiresAt: new Date("2026-10-17") });
    expect(await hasStoreFeature("test-store", FEATURES.FRONTEND_PREVIEW)).toBe(true);
    expect(await getStoreFeaturePresentation("test-store", FEATURES.FRONTEND_PREVIEW)).toBe("ENABLED");
    expect(await hasStoreFeature("test-store", FEATURES.MULTI_STORE)).toBe(false);
    for (const status of ["LOCKED", "HIDDEN"]) {
      m.entitlement.mockResolvedValue({ status, startsAt: null, expiresAt: null });
      expect(await hasStoreFeature("test-store", FEATURES.FRONTEND_PREVIEW)).toBe(false);
    }
  });
  it("opens single-store features while keeping headquarters and multi-store features closed", async () => {
    for (const feature of [FEATURES.CASHBOOK, FEATURES.CUSTOMER_CARE]) expect(await hasStoreFeature("test-store", feature)).toBe(true);
    expect(await hasStoreFeature("test-store", FEATURES.MULTI_STORE)).toBe(false);
    await expect(requireStoreFeature("test-store", FEATURES.CASHBOOK)).resolves.toBeUndefined();
  });
  it("honors an explicit active HQ grant for multi-store access", async () => {
    m.entitlement.mockResolvedValue({status:"ENABLED",startsAt:null,expiresAt:null});
    expect(await hasStoreFeature("test-store",FEATURES.MULTI_STORE)).toBe(true);
    m.entitlement.mockResolvedValue({status:"ENABLED",startsAt:new Date("2100-01-01"),expiresAt:null});
    expect(await hasStoreFeature("test-store",FEATURES.MULTI_STORE)).toBe(false);
  });
  it("keeps Steamfoot and SPA trial policies unchanged", async () => {
    for (const industry of ["steamfoot", "spa"]) {
      m.industry.mockResolvedValue(industry);
      expect(await hasStoreFeature("test-store", FEATURES.CASHBOOK)).toBe(false);
    }
  });
  it("does not unlock paid plans or unrecognized features", async () => {
    m.store.mockResolvedValue({ id: "test-store", plan: "BASIC" });
    expect(await hasStoreFeature("test-store", FEATURES.MULTI_STORE)).toBe(false);
    // @ts-expect-error Validate runtime rejection of an untrusted feature string.
    expect(await hasStoreFeature("test-store", "not-a-feature")).toBe(false);
  });
});
