import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), plans: vi.fn(), grant: vi.fn(), current: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: mocks.query, storeFeatureEntitlement: { findUnique: mocks.grant } } }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/store-plan", () => ({ getStoreForPlanByStoreId: mocks.plans, getCurrentStoreForPlan: mocks.current }));
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature, getStoreFeaturePresentation, hasCurrentStoreFeature } from "@/lib/feature-gate";
import { getCourseSharedCardStateInTransaction } from "@/server/services/course-shared-card";
const row = { industryModule: "COURSE", music: false, legacySharedPlan: false, status: "ENABLED", startsAt: null, expiresAt: null };
beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue([row]); mocks.current.mockResolvedValue({ id: "selected-sports", plan: "EXPERIENCE" }); });
describe("shared-card authoritative store gate", () => {
  it("queries the selected store rather than granting ADMIN/trial access", async () => {
    mocks.query.mockResolvedValue([{ ...row, status: "LOCKED" }]);
    expect(await hasCurrentStoreFeature(FEATURES.SHARED_CARD)).toBe(false);
    expect(mocks.query.mock.calls[0][1]).toBe("selected-sports");
    expect(mocks.plans).not.toHaveBeenCalled();
  });
  it.each(["LOCKED", "HIDDEN"])("respects %s before SPA demo/trial shortcuts", async status => {
    mocks.query.mockResolvedValue([{ ...row, industryModule: "SPA", status }]);
    expect(await hasStoreFeature("demo-store", FEATURES.SHARED_CARD)).toBe(false);
    expect(await getStoreFeaturePresentation("demo-store", FEATURES.SHARED_CARD)).toBe("HIDDEN");
    expect(mocks.plans).not.toHaveBeenCalled();
  });
  it("all-store HQ context cannot bypass either helper", async () => {
    mocks.current.mockResolvedValue({ id: "__all__" });
    const { checkCurrentStoreFeature } = await import("@/lib/feature-gate");
    expect(await hasCurrentStoreFeature(FEATURES.SHARED_CARD)).toBe(false);
    await expect(checkCurrentStoreFeature(FEATURES.SHARED_CARD)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("does not cache mutation authorization or use the cached generic grant", async () => {
    expect(await getCourseSharedCardStateInTransaction({ $queryRaw: mocks.query }, "store-a")).toBe("ENABLED");
    mocks.query.mockResolvedValue([{ ...row, status: "HIDDEN" }]);
    expect(await getCourseSharedCardStateInTransaction({ $queryRaw: mocks.query }, "store-a")).toBe("HIDDEN");
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.grant).not.toHaveBeenCalled();
  });
  it("keeps store isolation and reads full date controls, not only active grants", async () => {
    mocks.query.mockResolvedValue([{ ...row, legacySharedPlan: true, expiresAt: new Date("2000-01-01") }]);
    expect(await hasStoreFeature("store-b", FEATURES.SHARED_CARD)).toBe(false);
    const [sql, storeId] = mocks.query.mock.calls[0];
    expect(storeId).toBe("store-b");
    expect(sql.join("")).toContain('e."startsAt", e."expiresAt"');
    expect(sql.join("")).not.toContain("CoursePointPlan");
  });
});
