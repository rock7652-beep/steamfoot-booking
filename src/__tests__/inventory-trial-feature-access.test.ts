import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ store: vi.fn(), grant: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/db", () => ({ prisma: { storeFeatureEntitlement: { findUnique: m.grant } } }));
vi.mock("@/lib/store-plan", () => ({ getStoreForPlanByStoreId: m.store }));
import { inventoryFeatureAllowed } from "@/lib/inventory-feature-access";
import { hasStoreFeature, getStoreFeaturePresentation } from "@/lib/feature-gate";
import { FEATURES, hasFeature } from "@/lib/feature-flags";
beforeEach(() => { vi.clearAllMocks(); m.store.mockResolvedValue({ plan: "EXPERIENCE" }); m.grant.mockResolvedValue(null); });

describe("complete trial inventory access", () => {
  it("aligns plan defaults, sidebar presentation and the server gate without a manual grant", async () => {
    expect(hasFeature("EXPERIENCE", FEATURES.INVENTORY)).toBe(true);
    expect(await hasStoreFeature("trial-store", FEATURES.INVENTORY)).toBe(true);
    expect(await getStoreFeaturePresentation("trial-store", FEATURES.INVENTORY)).toBe("ENABLED");
    expect(m.grant).toHaveBeenCalledWith(expect.objectContaining({ where: { uq_store_feature_entitlement: { storeId: "trial-store", featureKey: "inventory" } } }));
  });
  it.each(["DISABLED", "LOCKED", "HIDDEN"])("keeps an explicit %s override closed", async status => {
    m.grant.mockResolvedValue({ status, startsAt: null, expiresAt: null });
    expect(await hasStoreFeature("trial-store", FEATURES.INVENTORY)).toBe(false);
    expect(await getStoreFeaturePresentation("trial-store", FEATURES.INVENTORY)).toBe("HIDDEN");
  });
  it.each(["BASIC", "GROWTH", "ALLIANCE"])("does not silently unlock a paid %s store", async plan => {
    m.store.mockResolvedValue({ plan });
    expect(await hasStoreFeature("paid-store", FEATURES.INVENTORY)).toBe(false);
    m.grant.mockResolvedValue({ status: "ENABLED", startsAt: null, expiresAt: null });
    expect(await hasStoreFeature("paid-store", FEATURES.INVENTORY)).toBe(true);
  });
  it("keeps grant date boundaries consistent for cached presentation and live transactions", () => {
    const now = new Date("2026-10-06T05:00:00Z");
    expect(inventoryFeatureAllowed("BASIC", { status: "ENABLED", startsAt: now, expiresAt: now }, now)).toBe(true);
    expect(inventoryFeatureAllowed("BASIC", { status: "ENABLED", startsAt: new Date(now.getTime() + 1) }, now)).toBe(false);
    expect(inventoryFeatureAllowed("BASIC", { status: "ENABLED", expiresAt: new Date(now.getTime() - 1) }, now)).toBe(false);
    expect(inventoryFeatureAllowed("EXPERIENCE", { status: "HIDDEN", startsAt: new Date(now.getTime() + 1) }, now)).toBe(true);
    expect(inventoryFeatureAllowed("EXPERIENCE", { status: "HIDDEN", startsAt: now }, now)).toBe(false);
  });
});
