import { beforeEach, describe, expect, it, vi } from "vitest";

const customerFindFirst = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  prisma: { customer: { findFirst: customerFindFirst } },
}));

import { DEFAULT_REFERRAL_SHARE_TEMPLATE } from "@/lib/share";
import { getReferralShareContext } from "@/server/queries/referral-share-context";

describe("getReferralShareContext", () => {
  beforeEach(() => vi.clearAllMocks());

  it("只產生店舖入口，並回傳同店有效模板", async () => {
    customerFindFirst.mockResolvedValue({
      id: "customer-t",
      referralCode: "ABC234",
      store: {
        name: "暖沐蒸足",
        slug: "taichung",
        operatingStatus: "ACTIVE",
        shopConfig: {
          lineOfficialUrl: "https://lin.ee/taichung",
          referralShareTemplate: "來 {storeName} 放鬆\n{url}",
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
      shareTemplate: "來 {storeName} 放鬆\n{url}",
    });
    expect(customerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "customer-t",
          storeId: "store-t",
          mergedIntoCustomerId: null,
        },
      }),
    );
  });

  it("模板未設定或 DB 值失效時由 server fallback", async () => {
    customerFindFirst.mockResolvedValue({
      id: "customer-z",
      referralCode: "ABC234",
      store: {
        name: "暖暖蒸足",
        slug: "zhubei",
        operatingStatus: "ACTIVE",
        shopConfig: {
          lineOfficialUrl: "https://lin.ee/zhubei",
          referralShareTemplate: "缺少網址 {storeName}",
        },
      },
    });

    const result = await getReferralShareContext({
      customerId: "customer-z",
      storeId: "store-z",
      storeSlug: "zhubei",
    });
    expect(result).toEqual({
      available: true,
      storeName: "暖暖蒸足",
      referralUrl: "/s/zhubei/line-entry?ref=ABC234",
      shareTemplate: DEFAULT_REFERRAL_SHARE_TEMPLATE,
    });
  });

  it("LINE 未設定時不產生分享網址或模板", async () => {
    customerFindFirst.mockResolvedValue({
      id: "customer-h",
      referralCode: "ABC234",
      store: {
        name: "以斯帖蒸足",
        slug: "hsinchu",
        operatingStatus: "ACTIVE",
        shopConfig: {
          lineOfficialUrl: null,
          referralShareTemplate: "來 {storeName}\n{url}",
        },
      },
    });

    await expect(
      getReferralShareContext({
        customerId: "customer-h",
        storeId: "store-h",
        storeSlug: "hsinchu",
      }),
    ).resolves.toEqual({
      available: false,
      reason: "LINE_NOT_CONFIGURED",
    });
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
      shareTemplate: DEFAULT_REFERRAL_SHARE_TEMPLATE,
    });
  });
});
