import { beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES, type FeatureKey } from "@/lib/feature-flags";

const mockEntitlementFindUnique = vi.fn();
const mockGetStoreForPlanByStoreId = vi.fn();

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ industryModule: "STEAMFOOT", music: false, legacySharedPlan: false, status: null, startsAt: null, expiresAt: null }]),
    storeFeatureEntitlement: {
      findUnique: (...args: unknown[]) => mockEntitlementFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/store-plan", () => ({
  getCurrentStoreForPlan: vi.fn(),
  getStoreForPlanByStoreId: (...args: unknown[]) => mockGetStoreForPlanByStoreId(...args),
}));

vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: vi.fn().mockResolvedValue("steamfoot") }));

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
  status: "ENABLED" | "DISABLED" | "LOCKED" | "HIDDEN",
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
  it.each([
    ["BASIC", false], ["GROWTH", true], ["ALLIANCE", true],
  ] as const)("%s data export follows the included package without an HQ grant", async (plan, expected) => {
    mockStore(plan);
    const { hasStoreFeature } = await import("@/lib/feature-gate");
    expect(await hasStoreFeature("store-1", FEATURES.DATA_EXPORT)).toBe(expected);
  });

  it.each(["DISABLED", "LOCKED", "HIDDEN"] as const)("included professional data export still honors HQ %s", async status => {
    mockStore("GROWTH");
    mockEntitlement(status);
    const { hasStoreFeature, requireStoreFeature } = await import("@/lib/feature-gate");
    expect(await hasStoreFeature("store-1", FEATURES.DATA_EXPORT)).toBe(false);
    await expect(requireStoreFeature("store-1", FEATURES.DATA_EXPORT)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("expired export grants return to the professional included package", async () => {
    mockStore("GROWTH");
    mockEntitlement("DISABLED", { expiresAt: new Date("2000-01-01") });
    const { hasStoreFeature } = await import("@/lib/feature-gate");
    expect(await hasStoreFeature("store-1", FEATURES.DATA_EXPORT)).toBe(true);
  });

  it("dated course trials include expansion features without manual grants", async () => {
    mockGetStoreForPlanByStoreId.mockResolvedValue({ id: "new-course", plan: "EXPERIENCE", planStatus: "TRIAL", planEffectiveAt: new Date("2026-09-18"), planExpiresAt: new Date("2026-10-17") });
    const { hasStoreFeature } = await import("@/lib/feature-gate");
    expect(await hasStoreFeature("new-course", FEATURES.DIGITAL_BUTLER)).toBe(true);
    expect(await hasStoreFeature("new-course", "multi_store" as FeatureKey)).toBe(true);
    expect(await hasStoreFeature("new-course", "headquarter_view" as FeatureKey)).toBe(true);
    expect(mockEntitlementFindUnique).toHaveBeenCalled();
  });
  it("opens every registered feature for the isolated SPA Demo store", async () => {
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("demo-store", FEATURES.DIGITAL_BUTLER),
    ).resolves.toBe(true);
    await expect(
      hasStoreFeature("demo-store", FEATURES.BASIC_REPORTS),
    ).resolves.toBe(true);
    expect(mockGetStoreForPlanByStoreId).not.toHaveBeenCalled();
    expect(mockEntitlementFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["BASIC", false],
    ["GROWTH", true],
    ["ALLIANCE", true],
  ] as const)("%s 無單店 entitlement 時 referral_share=%s", async (plan, expected) => {
    mockStore(plan);
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.REFERRAL_SHARE),
    ).resolves.toBe(expected);
  });

  it("BASIC + ENABLED 可使用 referral_share", async () => {
    mockEntitlement("ENABLED");
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.REFERRAL_SHARE),
    ).resolves.toBe(true);
  });

  it("GROWTH + DISABLED 不可使用 referral_share", async () => {
    mockStore("GROWTH");
    mockEntitlement("DISABLED");
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.REFERRAL_SHARE),
    ).resolves.toBe(false);
  });

  it.each([
    { startsAt: new Date("2099-01-01T00:00:00.000Z") },
    { expiresAt: new Date("2026-01-01T00:00:00.000Z") },
  ])("未生效或已到期時 referral_share 回到 BASIC 方案預設", async (dates) => {
    mockEntitlement("ENABLED", dates);
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.REFERRAL_SHARE),
    ).resolves.toBe(false);
  });

  it("基本版無加購時，不可用專業功能", async () => {
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.CUSTOMER_CARE),
    ).resolves.toBe(false);
  });

  it("基本版加購顧客經營時，可用顧客經營", async () => {
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

  it("專業版進階報表有開通 entitlement 時，可用 advanced_reports", async () => {
    mockStore("GROWTH");
    mockEntitlement("ENABLED");
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.BASIC_REPORTS),
    ).resolves.toBe(true);
  });

  it("專業版分析無 entitlement 時由方案內含", async () => {
    mockStore("GROWTH");
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.BASIC_REPORTS),
    ).resolves.toBe(true);
  });

  it("展店版分析無 entitlement 時由方案內含", async () => {
    mockStore("ALLIANCE");
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.BASIC_REPORTS),
    ).resolves.toBe(true);
  });

  it("展店版進階報表被 HQ 關閉 entitlement 時，不可用", async () => {
    mockStore("ALLIANCE");
    mockEntitlement("DISABLED");
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.BASIC_REPORTS),
    ).resolves.toBe(false);
  });

  it("進階報表 entitlement 尚未開始時，回到方案預設", async () => {
    mockStore("GROWTH");
    mockEntitlement("ENABLED", {
      startsAt: new Date("2099-01-01T00:00:00.000Z"),
    });
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.BASIC_REPORTS),
    ).resolves.toBe(true);
  });

  it("進階報表 entitlement 已過期時，回到方案預設", async () => {
    mockStore("GROWTH");
    mockEntitlement("ENABLED", {
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const { hasStoreFeature } = await import("@/lib/feature-gate");

    await expect(
      hasStoreFeature("store-1", FEATURES.BASIC_REPORTS),
    ).resolves.toBe(true);
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


describe("explicit HQ three-state controls", () => {
  it.each(["HIDDEN", "LOCKED"] as const)("%s also denies trial operations", async status => {
    mockGetStoreForPlanByStoreId.mockResolvedValue({id:"store-1",plan:"EXPERIENCE",planStatus:"TRIAL",planEffectiveAt:new Date("2026-09-18"),planExpiresAt:new Date("2026-10-17")});
    mockEntitlement(status);
    const {hasStoreFeature, getStoreFeaturePresentation, requireStoreFeature} = await import("@/lib/feature-gate");
    expect(await hasStoreFeature("store-1",FEATURES.CUSTOMER_LABELS)).toBe(false);
    expect(await getStoreFeaturePresentation("store-1",FEATURES.CUSTOMER_LABELS)).toBe(status);
    await expect(requireStoreFeature("store-1",FEATURES.CUSTOMER_LABELS)).rejects.toThrow();
  });
  it("an expired hidden override restores authorization and entry", async () => {
    mockStore("ALLIANCE");mockEntitlement("HIDDEN",{expiresAt:new Date("2020-01-01")});
    const {getStoreFeaturePresentation} = await import("@/lib/feature-gate");
    expect(await getStoreFeaturePresentation("store-1",FEATURES.BASIC_REPORTS)).toBe("ENABLED");
  });
});


describe("frontend preview paid add-on", () => {
  it.each(["BASIC", "GROWTH", "ALLIANCE"] as const)("%s does not grant preview implicitly", async plan => {
    mockStore(plan);
    const { hasStoreFeature } = await import("@/lib/feature-gate");
    expect(await hasStoreFeature("store-1", FEATURES.FRONTEND_PREVIEW)).toBe(false);
  });
  it("dated single-store trial includes preview without an explicit grant", async () => {
    mockGetStoreForPlanByStoreId.mockResolvedValue({ id: "store-1", plan: "EXPERIENCE", planStatus: "TRIAL", planEffectiveAt: new Date("2026-09-18"), planExpiresAt: new Date("2026-10-17") });
    const { hasStoreFeature, getStoreFeaturePresentation, requireStoreFeature } = await import("@/lib/feature-gate");
    expect(await hasStoreFeature("store-1", FEATURES.FRONTEND_PREVIEW)).toBe(true);
    expect(await getStoreFeaturePresentation("store-1", FEATURES.FRONTEND_PREVIEW)).toBe("ENABLED");
    await expect(requireStoreFeature("store-1", FEATURES.FRONTEND_PREVIEW)).resolves.toBeUndefined();
    mockEntitlement("ENABLED");
    expect(await hasStoreFeature("store-1", FEATURES.FRONTEND_PREVIEW)).toBe(true);
  });
  it.each(["LOCKED", "HIDDEN"] as const)("keeps %s preview restrictions in full trials", async status => {
    mockGetStoreForPlanByStoreId.mockResolvedValue({ id: "store-1", plan: "EXPERIENCE", planStatus: "TRIAL", planEffectiveAt: new Date("2026-09-18"), planExpiresAt: new Date("2026-10-17") });
    mockEntitlement(status);
    const { hasStoreFeature, getStoreFeaturePresentation, requireStoreFeature } = await import("@/lib/feature-gate");
    expect(await hasStoreFeature("store-1", FEATURES.FRONTEND_PREVIEW)).toBe(false);
    expect(await getStoreFeaturePresentation("store-1", FEATURES.FRONTEND_PREVIEW)).toBe(status);
    await expect(requireStoreFeature("store-1", FEATURES.FRONTEND_PREVIEW)).rejects.toThrow();
  });
});

describe("full single-store trial across industries", () => {
  it("includes preview, LIFF and all single-store features for legacy undated trial stores", async () => {
    mockStore("EXPERIENCE");
    const { hasStoreFeature, getStoreFeaturePresentation, requireStoreFeature } = await import("@/lib/feature-gate");
    const excluded = new Set<FeatureKey>([FEATURES.SHARED_CARD, FEATURES.STORE_OPERATION_AUDIT]);
    for (const feature of Object.values(FEATURES)) {
      expect(await hasStoreFeature("store-1", feature), feature).toBe(!excluded.has(feature));
    }
    expect(await getStoreFeaturePresentation("store-1", FEATURES.FRONTEND_PREVIEW)).toBe("ENABLED");
    await expect(requireStoreFeature("store-1", FEATURES.FRONTEND_PREVIEW)).resolves.toBeUndefined();
  });
  it.each(["HIDDEN", "LOCKED"] as const)("retains the HQ %s override on trial preview", async status => {
    mockStore("EXPERIENCE");
    mockEntitlement(status);
    const { getStoreFeaturePresentation, requireStoreFeature } = await import("@/lib/feature-gate");
    expect(await getStoreFeaturePresentation("store-1", FEATURES.FRONTEND_PREVIEW)).toBe(status);
    await expect(requireStoreFeature("store-1", FEATURES.FRONTEND_PREVIEW)).rejects.toThrow();
  });
});

describe("inventory and work order paid add-ons", () => {
  it.each(["BASIC", "GROWTH", "ALLIANCE"] as const)("requires independent grants in %s", async plan => {
    mockStore(plan);
    const {hasStoreFeature,getStoreFeaturePresentation,requireStoreFeature}=await import("@/lib/feature-gate");
    for (const feature of [FEATURES.INVENTORY,FEATURES.WORK_ORDERS]) {
      mockEntitlementFindUnique.mockResolvedValue(null);
      expect(await hasStoreFeature("store-a",feature)).toBe(false);
      expect(await getStoreFeaturePresentation("store-a",feature)).toBe("HIDDEN");
      await expect(requireStoreFeature("store-a",feature)).rejects.toThrow();
      mockEntitlementFindUnique.mockImplementation(async ({where}: {where:{uq_store_feature_entitlement:{featureKey:string}}}) =>
        where.uq_store_feature_entitlement.featureKey === feature ? {status:"ENABLED",startsAt:null,expiresAt:null} : null);
      expect(await hasStoreFeature("store-a",feature)).toBe(true);
      expect(await getStoreFeaturePresentation("store-a",feature)).toBe("ENABLED");
      const other = feature===FEATURES.INVENTORY?FEATURES.WORK_ORDERS:FEATURES.INVENTORY;
      expect(await hasStoreFeature("store-a",other)).toBe(false);
      for (const status of ["DISABLED","LOCKED","HIDDEN"] as const) {
        mockEntitlement(status);
        expect(await hasStoreFeature("store-a",feature)).toBe(false);
      }
      mockEntitlement("ENABLED",{startsAt:new Date("2099-01-01")});
      expect(await hasStoreFeature("store-a",feature)).toBe(false);
      mockEntitlement("ENABLED",{expiresAt:new Date("2000-01-01")});
      expect(await hasStoreFeature("store-a",feature)).toBe(false);
    }
  });
  it("keeps the latest full trial access and HQ overrides", async () => {
    mockStore("EXPERIENCE");
    const {hasStoreFeature}=await import("@/lib/feature-gate");
    expect(await hasStoreFeature("store-a",FEATURES.WORK_ORDERS)).toBe(true);
    mockEntitlement("DISABLED");
    expect(await hasStoreFeature("store-a",FEATURES.WORK_ORDERS)).toBe(false);
    mockEntitlement("ENABLED");
    expect(await hasStoreFeature("store-a",FEATURES.WORK_ORDERS)).toBe(true);
  });
});

it.each([
  ["steamfoot", "STEAMFOOT", false], ["spa", "SPA", false],
  ["sports", "COURSE", false], ["music", "COURSE", true],
])("%s audit remains explicit and store-specific despite demo/trial/module defaults", async (label, industryModule, music) => {
  const storeId = `fixture-${label}`;
  mockGetStoreForPlanByStoreId.mockResolvedValue({ id: storeId, plan: "EXPERIENCE", isDemo: true, industryModule, music });
  const { hasStoreFeature } = await import("@/lib/feature-gate");
  expect(await hasStoreFeature(storeId, FEATURES.STORE_OPERATION_AUDIT)).toBe(false);
  mockEntitlement("ENABLED");
  expect(await hasStoreFeature(storeId, FEATURES.STORE_OPERATION_AUDIT)).toBe(true);
  expect(mockEntitlementFindUnique).toHaveBeenLastCalledWith({
    where: { uq_store_feature_entitlement: { storeId, featureKey: FEATURES.STORE_OPERATION_AUDIT } },
    select: { status: true, startsAt: true, expiresAt: true },
  });
  for (const status of ["HIDDEN", "DISABLED", "LOCKED"] as const) {
    mockEntitlement(status);
    expect(await hasStoreFeature(storeId, FEATURES.STORE_OPERATION_AUDIT)).toBe(false);
  }
  // The audit gate runs before the plan/demo/module shortcuts.
  expect(mockGetStoreForPlanByStoreId).not.toHaveBeenCalled();
});
