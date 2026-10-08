import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), query: vi.fn(), upsert: vi.fn(), remove: vi.fn(), revalidate: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdminSession: mocks.admin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/revalidation", () => ({ revalidateStoreFeatureEntitlements: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
import { saveStoreFeatureEntitlement } from "@/server/actions/store-feature-entitlement";
const form = (override = "ENABLED", values: Record<string, string> = {}) => { const f = new FormData(); for (const [key, value] of Object.entries({ storeId: "sports-1", featureKey: "shared_card", override, ...values })) f.set(key, value); return f; };
beforeEach(() => {
  vi.clearAllMocks(); mocks.admin.mockResolvedValue({ id: "hq-user" }); mocks.query.mockResolvedValue([{ id: "sports-1" }]);
  mocks.transaction.mockImplementation(async work => work({ $queryRaw: mocks.query, storeFeatureEntitlement: { upsert: mocks.upsert, deleteMany: mocks.remove } }));
});
describe("HQ shared-card controls", () => {
  it.each(["ENABLED", "LOCKED", "HIDDEN"])("writes %s only under the same store lock as course mutations", async status => {
    expect((await saveStoreFeatureEntitlement(form(status))).success).toBe(true);
    expect(mocks.query.mock.calls[0][0].join("")).toContain("FOR UPDATE OF s");
    expect(mocks.query.mock.calls[0][0].join("")).toContain("'business.music'");
    expect(mocks.query.mock.calls[0][1]).toBe("sports-1");
    expect(mocks.upsert.mock.calls[0][0].create).toMatchObject({ storeId: "sports-1", status, featureKey: "shared_card", createdBy: "hq-user" });
    expect(mocks.query.mock.invocationCallOrder[0]).toBeLessThan(mocks.upsert.mock.invocationCallOrder[0]);
  });
  it("refuses unsupported stores before creating any grant", async () => {
    mocks.query.mockResolvedValue([]);
    expect((await saveStoreFeatureEntitlement(form())).success).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("does not permit selected-store roles to skip HQ authorization", async () => {
    mocks.admin.mockRejectedValue(new Error("HQ required"));
    expect((await saveStoreFeatureEntitlement(form())).success).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("removes the override only through explicit INHERIT", async () => {
    expect((await saveStoreFeatureEntitlement(form("INHERIT"))).success).toBe(true);
    expect(mocks.remove).toHaveBeenCalledWith({ where: { storeId: "sports-1", featureKey: "shared_card" } });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("rejects malformed or reversed dates before mutation", async () => {
    expect((await saveStoreFeatureEntitlement(form("ENABLED", { startsAt: "2026-12-01", expiresAt: "2026-11-01" }))).success).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
