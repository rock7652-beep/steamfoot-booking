import { beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/lib/feature-flags";

const mockRequireAdminSession = vi.fn();
const mockStoreFindUnique = vi.fn();
const mockEntitlementDeleteMany = vi.fn();
const mockEntitlementUpsert = vi.fn();
const mockRevalidateStoreFeatureEntitlements = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock("@/lib/session", () => ({
  requireAdminSession: () => mockRequireAdminSession(),
}));

vi.mock("@/lib/revalidation", () => ({
  revalidateStoreFeatureEntitlements: () => mockRevalidateStoreFeatureEntitlements(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    store: {
      findUnique: (...args: unknown[]) => mockStoreFindUnique(...args),
    },
    storeFeatureEntitlement: {
      deleteMany: (...args: unknown[]) => mockEntitlementDeleteMany(...args),
      upsert: (...args: unknown[]) => mockEntitlementUpsert(...args),
    },
  },
}));

function formData(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
  mockStoreFindUnique.mockResolvedValue({ id: "store-1" });
  mockEntitlementDeleteMany.mockResolvedValue({ count: 1 });
  mockEntitlementUpsert.mockResolvedValue({ id: "entitlement-1" });
});

describe("saveStoreFeatureEntitlement", () => {
  it("INHERIT deletes the single-store override", async () => {
    const { saveStoreFeatureEntitlement } = await import(
      "@/server/actions/store-feature-entitlement"
    );

    const result = await saveStoreFeatureEntitlement(
      formData({
        storeId: "store-1",
        featureKey: FEATURES.CUSTOMER_CARE,
        override: "INHERIT",
      }),
    );

    expect(result.success).toBe(true);
    expect(mockEntitlementDeleteMany).toHaveBeenCalledWith({
      where: { storeId: "store-1", featureKey: FEATURES.CUSTOMER_CARE },
    });
    expect(mockEntitlementUpsert).not.toHaveBeenCalled();
    expect(mockRevalidateStoreFeatureEntitlements).toHaveBeenCalledTimes(1);
  });

  it("ENABLED upserts an add-on entitlement with Taipei date boundaries", async () => {
    const { saveStoreFeatureEntitlement } = await import(
      "@/server/actions/store-feature-entitlement"
    );

    const result = await saveStoreFeatureEntitlement(
      formData({
        storeId: "store-1",
        featureKey: FEATURES.DATA_EXPORT,
        override: "ENABLED",
        source: "ADDON",
        startsAt: "2026-07-01",
        expiresAt: "2026-07-31",
        note: "加購資料匯出",
      }),
    );

    expect(result.success).toBe(true);
    expect(mockEntitlementUpsert).toHaveBeenCalledTimes(1);
    const payload = mockEntitlementUpsert.mock.calls[0][0];
    expect(payload.where.uq_store_feature_entitlement).toEqual({
      storeId: "store-1",
      featureKey: FEATURES.DATA_EXPORT,
    });
    expect(payload.create.status).toBe("ENABLED");
    expect(payload.create.source).toBe("ADDON");
    expect(payload.create.startsAt.toISOString()).toBe("2026-06-30T16:00:00.000Z");
    expect(payload.create.expiresAt.toISOString()).toBe("2026-07-31T15:59:59.999Z");
    expect(payload.create.note).toBe("加購資料匯出");
    expect(payload.create.createdBy).toBe("admin-1");
    expect(payload.update.updatedBy).toBe("admin-1");
  });

  it("DISABLED can be saved as an HQ override", async () => {
    const { saveStoreFeatureEntitlement } = await import(
      "@/server/actions/store-feature-entitlement"
    );

    const result = await saveStoreFeatureEntitlement(
      formData({
        storeId: "store-1",
        featureKey: FEATURES.CASH_DRAWER,
        override: "DISABLED",
        source: "HQ_OVERRIDE",
      }),
    );

    expect(result.success).toBe(true);
    const payload = mockEntitlementUpsert.mock.calls[0][0];
    expect(payload.create.status).toBe("DISABLED");
    expect(payload.create.source).toBe("HQ_OVERRIDE");
  });

  it("invalid feature key returns an error and does not write", async () => {
    const { saveStoreFeatureEntitlement } = await import(
      "@/server/actions/store-feature-entitlement"
    );

    const result = await saveStoreFeatureEntitlement(
      formData({
        storeId: "store-1",
        featureKey: "not_a_feature",
        override: "ENABLED",
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("無效的功能代碼");
    expect(mockStoreFindUnique).not.toHaveBeenCalled();
    expect(mockEntitlementDeleteMany).not.toHaveBeenCalled();
    expect(mockEntitlementUpsert).not.toHaveBeenCalled();
  });

  it("non-admin sessions are rejected", async () => {
    mockRequireAdminSession.mockRejectedValue(new Error("此功能僅限系統管理者使用"));
    const { saveStoreFeatureEntitlement } = await import(
      "@/server/actions/store-feature-entitlement"
    );

    const result = await saveStoreFeatureEntitlement(
      formData({
        storeId: "store-1",
        featureKey: FEATURES.CUSTOMER_CARE,
        override: "ENABLED",
      }),
    );

    expect(result.success).toBe(false);
    expect(mockEntitlementUpsert).not.toHaveBeenCalled();
  });
});
