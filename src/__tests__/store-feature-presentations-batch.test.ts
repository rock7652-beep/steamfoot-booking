import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FEATURES } from "@/lib/feature-flags";
import type { PricingPlan } from "@prisma/client";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn }));
const m = vi.hoisted(() => ({ store: vi.fn(), all: vi.fn(), one: vi.fn(), shared: vi.fn(), plan: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: m.store }, storeFeatureEntitlement: { findMany: m.all, findUnique: m.one }, $queryRaw: m.shared } }));
vi.mock("@/lib/store-plan", () => ({ getStoreForPlanByStoreId: m.plan, getCurrentStoreForPlan: vi.fn() }));
import { getStoreFeaturePresentations } from "@/server/queries/store-feature-presentations";
import { getStoreFeaturePresentation } from "@/lib/feature-gate";
const now = new Date("2026-10-22T11:00:00Z");
type Grant = { featureKey: string; status: "ENABLED" | "DISABLED" | "LOCKED" | "HIDDEN"; startsAt: Date | null; expiresAt: Date | null };
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());
function setup(plan: PricingPlan, industryModule: string, music: boolean, grants: Grant[]) {
 m.store.mockResolvedValue({ plan, industryModule }); m.plan.mockResolvedValue({ id: "store-a", plan });
 m.all.mockResolvedValue(grants); m.one.mockImplementation(({ where }) => Promise.resolve(grants.find(row => row.featureKey === where.uq_store_feature_entitlement.featureKey) ?? null));
 m.shared.mockResolvedValue([{ industryModule, music, ...(grants.find(row => row.featureKey === FEATURES.SHARED_CARD) ?? { status: null, startsAt: null, expiresAt: null }) }]);
}
const cases = (["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"] as const).flatMap(plan =>
 (["steam", "course", "music"] as const).flatMap(module =>
 (["NONE", "ENABLED", "DISABLED", "LOCKED", "HIDDEN"] as const).flatMap(status =>
 (status === "NONE" ? ["active"] : ["active", "future", "expired", "boundary"]).map(period => ({ plan, module, status, period })))));
it.each(cases)("matches existing UI policy for $plan/$module/$status/$period in two queries", async ({ plan, module, status, period }) => {
 const startsAt = period === "future" ? new Date(now.getTime() + 1000) : null;
 const expiresAt = period === "expired" ? new Date(now.getTime() - 1000) : period === "boundary" ? now : null;
 const grants: Grant[] = status === "NONE" ? [] : Object.values(FEATURES).map(featureKey => ({ featureKey, status, startsAt, expiresAt }));
 if (module === "music") grants.push({ featureKey: "business.music", status: "ENABLED", startsAt, expiresAt });
 setup(plan, module === "steam" ? "STEAMFOOT" : "COURSE", module === "music", grants);
 const states = await getStoreFeaturePresentations("store-a");
 expect(m.store).toHaveBeenCalledTimes(1); expect(m.all).toHaveBeenCalledTimes(1); expect(m.one).not.toHaveBeenCalled(); expect(m.shared).not.toHaveBeenCalled();
 for (const feature of Object.values(FEATURES)) expect(states[feature], feature).toBe(await getStoreFeaturePresentation("store-a", feature));
 expect(Object.keys(states).sort()).toEqual(Object.values(FEATURES).sort());
});
it("keeps requests scoped to the selected store and rejects missing stores", async () => {
 setup("BASIC", "STEAMFOOT", false, []); await getStoreFeaturePresentations("store-b");
 expect(m.store).toHaveBeenCalledWith({ where: { id: "store-b" }, select: { plan: true, industryModule: true } });
 expect(m.all.mock.calls[0][0].where).toEqual({ storeId: "store-b" });
 m.store.mockResolvedValue(null); await expect(getStoreFeaturePresentations("missing")).rejects.toThrow("Store not found");
});
it("preserves demo special cases rather than unlocking add-ons", async () => {
 setup("ALLIANCE", "STEAMFOOT", false, []); const states = await getStoreFeaturePresentations("demo-store");
 for (const feature of Object.values(FEATURES)) expect(states[feature]).toBe(await getStoreFeaturePresentation("demo-store", feature));
 expect(states[FEATURES.WORK_ORDERS]).toBe("HIDDEN"); expect(states[FEATURES.INVENTORY]).toBe("HIDDEN");
});
