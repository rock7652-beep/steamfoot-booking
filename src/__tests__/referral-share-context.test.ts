import { beforeEach, describe, expect, it, vi } from "vitest";

const customerFindFirst = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: { customer: { findFirst: customerFindFirst } } }));

import { getReferralShareContext } from "@/server/queries/referral-share-context";

describe("getReferralShareContext", () => {
  beforeEach(() => vi.clearAllMocks());

  it("只產生店舖入口，不把 LINE URL 傳給 client", async () => {
    customerFindFirst.mockResolvedValue({
      referralCode: "ABC234",
      store: {
        name: "暖沐蒸足",
        slug: "taichung",
        operatingStatus: "ACTIVE",
        shopConfig: { lineOfficialUrl: "https://lin.ee/taichung" },
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
    });
  });

  it("LINE 未設定時不產生分享網址", async () => {
    customerFindFirst.mockResolvedValue({
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
});
