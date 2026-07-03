import { beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES, type FeatureKey } from "@/lib/feature-flags";

const mockEntitlementFindUnique = vi.fn();
const mockGetStoreForPlanByStoreId = vi.fn();

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    storeFeatureEntitlement: {
      findUnique: (...args: unknown[]) => mockEntitlementFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/store-plan", () => ({
  getCurrentStoreForPlan: vi.fn(),
  getStoreForPlanByStoreId: (...args: unknown[]) => mockGetStoreForPlanByStoreId(...args),
}));

function mockStore(plan: "EXPERIENCE" | "BASIC" | "GROWTH" | "ALLIANCE") {
  mockGetStoreForPlanByStoreId.mockResolvedValue({
    id: "store-1",
    plan,
    maxStaffOverride: null,
    maxCustomersOverride: null,
    maxMonthlyBookingsOverride: null,
    maxMonthlyReportsOverride: null,
    maxReminderSendsOverride: null,
    maxStoresOverride: null,
  });
}

function mockEntitlement(
  status: "ENABLED" | "DISABLED",
  dates?: { startsAt?: Date | null; expiresAt?: Date | null },
) {
  mockEntitlementFindUnique.mockResolvedValue({
    status,
    startsAt: dates?.startsAt ?? null,
    expiresAt: dates?.expiresAt ?? null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStore("BASIC");
  mockEntitlementFindUnique.mockResolvedValue(null);
});

describe("hasStoreFeature", () => {
  it("基礎版無加購時，不可用專業功能", async () => {
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.CUSTOMER_CARE),
    ).resolves.toBe(false);
  });

  it("基礎版加購顧客經營時，可用顧客經營", async () => {
    mockEntitlement("ENABLED");
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.CUSTOMER_CARE),
    ).resolves.toBe(true);
  });

  it("專業版內含顧客經營時，可用顧客經營", async () => {
    mockStore("GROWTH");
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.CUSTOMER_CARE),
    ).resolves.toBe(true);
  });

  it("專業版被 HQ 關閉顧客經營時，不可用顧客經營", async () => {
    mockStore("GROWTH");
    mockEntitlement("DISABLED");
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.CUSTOMER_CARE),
    ).resolves.toBe(false);
  });

  it("加購已過期時，回到方案預設", async () => {
    mockEntitlement("ENABLED", {
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.CUSTOMER_CARE),
    ).resolves.toBe(false);
  });

  it("展店版內含多店功能", async () => {
    mockStore("ALLIANCE");
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.MULTI_STORE),
    ).resolves.toBe(true);
  });

  it("低方案手動開通 multi_store 時，可用母子店 / 多店", async () => {
    mockStore("BASIC");
    mockEntitlement("ENABLED");
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.MULTI_STORE),
    ).resolves.toBe(true);
  });

  it("featureKey 不存在時回 false 且不查資料庫", async () => {
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", "not_a_feature" as FeatureKey),
    ).resolves.toBe(false);
    expect(mockGetStoreForPlanByStoreId).not.toHaveBeenCalled();
    expect(mockEntitlementFindUnique).not.toHaveBeenCalled();
  });
});

describe("requireStoreFeature", () => {
  it("未授權時丟出加購提示", async () => {
    const { requireStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      requireStoreFeature("store-1", FEATURES.CUSTOMER_CARE),
    ).rejects.toThrow("此功能尚未開通，請聯絡總部加購或升級方案");
  });
});
