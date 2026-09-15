import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ store: vi.fn(), industry: vi.fn(), entitlement: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/db", () => ({ prisma: { storeFeatureEntitlement: { findUnique: m.entitlement } } }));
vi.mock("@/lib/store-plan", () => ({ getStoreForPlanByStoreId: m.store, getCurrentStoreForPlan: m.store }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: m.industry }));
import { hasStoreFeature, requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
beforeEach(() => { vi.clearAllMocks(); m.store.mockResolvedValue({ id: "test-store", plan: "EXPERIENCE", planStatus: "ACTIVE" }); m.industry.mockResolvedValue("course"); m.entitlement.mockResolvedValue(null); });
describe("course trial availability", () => {
  it("opens every recognized feature for course trial through the server gate", async () => {
    for (const feature of Object.values(FEATURES)) expect(await hasStoreFeature("test-store", feature)).toBe(true);
    await expect(requireStoreFeature("test-store", FEATURES.CASHBOOK)).resolves.toBeUndefined();
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
