import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storeFindUnique: vi.fn(),
  customerFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    store: { findUnique: mocks.storeFindUnique },
    customer: { findFirst: mocks.customerFindFirst },
  },
}));

import { resolveLineReferralEntry } from "@/server/queries/line-referral-entry";

describe("resolveLineReferralEntry", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["zhubei", "store-z", "https://lin.ee/zhubei"],
    ["hsinchu", "store-h", "https://line.me/R/ti/p/@hsinchu"],
    ["taichung", "store-t", "https://lin.ee/taichung"],
  ])("導向 %s 自己的 LINE", async (slug, storeId, lineOfficialUrl) => {
    mocks.storeFindUnique.mockResolvedValue({
      id: storeId,
      operatingStatus: "ACTIVE",
      shopConfig: { lineOfficialUrl },
    });
    mocks.customerFindFirst.mockResolvedValue({ id: `customer-${slug}` });

    await expect(resolveLineReferralEntry(slug, "ABC234")).resolves.toEqual({
      status: "READY",
      storeId,
      referrerId: `customer-${slug}`,
      lineOfficialUrl,
    });
    expect(mocks.customerFindFirst).toHaveBeenCalledWith({
      where: { referralCode: "ABC234", storeId, mergedIntoCustomerId: null },
      select: { id: true },
    });
  });

  it("把新竹推薦碼放進台中網址時拒絕", async () => {
    mocks.storeFindUnique.mockResolvedValue({
      id: "store-taichung",
      operatingStatus: "ACTIVE",
      shopConfig: { lineOfficialUrl: "https://lin.ee/taichung" },
    });
    mocks.customerFindFirst.mockResolvedValue(null);

    await expect(resolveLineReferralEntry("taichung", "ABC234")).resolves.toEqual({
      status: "INVALID_REFERRAL",
    });
  });

  it("LINE 未設定時停止且不查推薦人", async () => {
    mocks.storeFindUnique.mockResolvedValue({
      id: "store-hsinchu",
      operatingStatus: "ACTIVE",
      shopConfig: { lineOfficialUrl: null },
    });

    await expect(resolveLineReferralEntry("hsinchu", "ABC234")).resolves.toEqual({
      status: "LINE_NOT_CONFIGURED",
    });
    expect(mocks.customerFindFirst).not.toHaveBeenCalled();
  });

  it("過渡期接受舊 customer id，但仍限定同店且未 merged", async () => {
    mocks.storeFindUnique.mockResolvedValue({
      id: "store-z",
      operatingStatus: "ACTIVE",
      shopConfig: { lineOfficialUrl: "https://lin.ee/zhubei" },
    });

    mocks.customerFindFirst.mockResolvedValue({ id: "customer-cuid" });
    await expect(resolveLineReferralEntry("zhubei", "customer-cuid")).resolves.toEqual({
      status: "READY",
      storeId: "store-z",
      referrerId: "customer-cuid",
      lineOfficialUrl: "https://lin.ee/zhubei",
    });
    expect(mocks.customerFindFirst).toHaveBeenCalledWith({
      where: {
        id: "customer-cuid",
        storeId: "store-z",
        mergedIntoCustomerId: null,
      },
      select: { id: true },
    });

    mocks.customerFindFirst.mockResolvedValue(null);
    await expect(resolveLineReferralEntry("zhubei", "ABC234")).resolves.toEqual({
      status: "INVALID_REFERRAL",
    });
  });
});
