import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  resolveWriteStoreId: vi.fn(),
  upsert: vi.fn(),
  revalidateShopConfig: vi.fn(),
  revalidatePath: vi.fn(),
  requireStoreFeature: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { shopConfig: { upsert: mocks.upsert } },
}));
vi.mock("@/lib/permissions", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/store", () => ({
  resolveWriteStoreId: mocks.resolveWriteStoreId,
}));
vi.mock("@/lib/revalidation", () => ({
  revalidateShopConfig: mocks.revalidateShopConfig,
}));
vi.mock("@/lib/feature-gate", () => ({
  requireStoreFeature: mocks.requireStoreFeature,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { updateReferralShareTemplate } from "@/server/actions/referral-share-template";

describe("updateReferralShareTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({
      id: "owner-a",
      role: "OWNER",
      storeId: "store-a",
    });
    mocks.resolveWriteStoreId.mockResolvedValue("store-a");
    mocks.upsert.mockResolvedValue({ id: "config-a" });
    mocks.requireStoreFeature.mockResolvedValue(undefined);
  });

  it("writes only to the authenticated writable store", async () => {
    const template = "歡迎來 {storeName}\n{url}";
    const result = await updateReferralShareTemplate({
      referralShareTemplate: template,
      storeId: "store-b",
    });

    expect(result.success).toBe(true);
    expect(mocks.requireStoreFeature).toHaveBeenCalledWith("store-a", "referral_share");
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { storeId: "store-a" },
      create: { storeId: "store-a", referralShareTemplate: template },
      update: { referralShareTemplate: template },
    });
  });

  it("direct action call is rejected when the authenticated store is not entitled", async () => {
    mocks.requireStoreFeature.mockRejectedValue(new Error("此功能尚未開通"));

    const result = await updateReferralShareTemplate({
      referralShareTemplate: "歡迎來 {storeName}\n{url}",
      storeId: "store-b",
    });

    expect(result.success).toBe(false);
    expect(mocks.requireStoreFeature).toHaveBeenCalledWith("store-a", "referral_share");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects invalid variables before any write", async () => {
    const result = await updateReferralShareTemplate({
      referralShareTemplate: "嗨 {customerName}\n{url}",
    });

    expect(result).toEqual({
      success: false,
      error: "不支援變數 {customerName}，僅可使用 {storeName} 與 {url}",
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("stores null when the merchant restores the system default", async () => {
    const result = await updateReferralShareTemplate({
      referralShareTemplate: "   ",
    });

    expect(result.success).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { storeId: "store-a" },
      create: { storeId: "store-a", referralShareTemplate: null },
      update: { referralShareTemplate: null },
    });
  });
});
