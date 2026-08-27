import { beforeEach, describe, expect, it, vi } from "vitest";

const customerFindFirst = vi.hoisted(() => vi.fn());
const hasStoreFeature = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: { customer: { findFirst: customerFindFirst } } }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature }));

import { getReferralShareContext } from "@/server/queries/referral-share-context";

describe("getReferralShareContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasStoreFeature.mockResolvedValue(true);
  });

  it("未開通時不讀取或回傳分享 context", async () => {
    hasStoreFeature.mockResolvedValue(false);

    await expect(
      getReferralShareContext({
        customerId: "customer-t",
        storeId: "store-t",
        storeSlug: "taichung",
      }),
    ).resolves.toEqual({ available: false, reason: "FEATURE_NOT_ENABLED" });
    expect(customerFindFirst).not.toHaveBeenCalled();
  });

  it("偽造其他 storeId 時不會讀到原店顧客資料", async () => {
    customerFindFirst.mockResolvedValue(null);

    await expect(
      getReferralShareContext({
        customerId: "customer-a",
        storeId: "store-b",
        storeSlug: "store-b",
      }),
    ).resolves.toEqual({ available: false, reason: "STORE_UNAVAILABLE" });
    expect(customerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "customer-a", storeId: "store-b" }),
      }),
    );
  });

  it("只產生店舖入口，不把 LINE URL 傳給 client", async () => {
    customerFindFirst.mockResolvedValue({
      id: "customer-t",
      referralCode: "ABC234",
      store: {
        name: "暖沐蒸足",
        slug: "taichung",
        operatingStatus: "ACTIVE",
        shopConfig: {
          lineOfficialUrl: "https://lin.ee/taichung",
          referralShareTemplate: null,
          address: "台中市北區測試路 1 號",
          mapUrl: "https://maps.google.com/taichung",
        },
      },
    });

    await expect(
      getReferralShareContext({
        customerId: "customer-t",
        storeId: "store-t",
        storeSlug: "taichung",
      }),
    ).resolves.toEqual({
      available: true,
      storeName: "暖沐蒸足",
      referralUrl: "/s/taichung/line-entry?ref=ABC234",
      publicTrialReferralUrl:
        "/s/taichung/line-entry?ref=ABC234&destination=public-trial&source=liff-store-share",
      shareTemplate: null,
      address: "台中市北區測試路 1 號",
      mapUrl: "https://maps.google.com/taichung",
    });
  });

  it("LINE 未設定時不產生分享網址", async () => {
    customerFindFirst.mockResolvedValue({
      id: "customer-h",
      referralCode: "ABC234",
      store: {
        name: "以斯帖蒸足",
        slug: "hsinchu",
        operatingStatus: "ACTIVE",
        shopConfig: { lineOfficialUrl: null },
      },
    });

    await expect(
      getReferralShareContext({
        customerId: "customer-h",
        storeId: "store-h",
        storeSlug: "hsinchu",
      }),
    ).resolves.toEqual({ available: false, reason: "LINE_NOT_CONFIGURED" });
  });

  it("舊顧客沒有 referralCode 時暫用 customer.id", async () => {
    customerFindFirst.mockResolvedValue({
      id: "legacy-customer-id",
      referralCode: null,
      store: {
        name: "暖暖蒸足",
        slug: "zhubei",
        operatingStatus: "ACTIVE",
        shopConfig: {
          lineOfficialUrl: "https://lin.ee/zhubei",
          referralShareTemplate: null,
          address: null,
          mapUrl: null,
        },
      },
    });

    await expect(
      getReferralShareContext({
        customerId: "legacy-customer-id",
        storeId: "store-z",
        storeSlug: "zhubei",
      }),
    ).resolves.toEqual({
      available: true,
      storeName: "暖暖蒸足",
      referralUrl: "/s/zhubei/line-entry?ref=legacy-customer-id",
      publicTrialReferralUrl:
        "/s/zhubei/line-entry?ref=legacy-customer-id&destination=public-trial&source=liff-store-share",
      shareTemplate: null,
      address: null,
      mapUrl: null,
    });
  });
});
