import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  resolveWriteStoreId: vi.fn(),
  upsert: vi.fn(),
  revalidateShopConfig: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/store", () => ({
  resolveWriteStoreId: mocks.resolveWriteStoreId,
}));
vi.mock("@/lib/db", () => ({
  prisma: { shopConfig: { upsert: mocks.upsert } },
}));
vi.mock("@/lib/revalidation", () => ({
  revalidateShopConfig: mocks.revalidateShopConfig,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { updateReferralShareTemplate } from "@/server/actions/referral-share-template";

describe("updateReferralShareTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({
      id: "staff-a",
      role: "ADMIN",
      storeId: null,
    });
    mocks.resolveWriteStoreId.mockResolvedValue("store-b");
    mocks.upsert.mockResolvedValue({ id: "config-b" });
  });

  it("使用 authenticated write-store，不接受 client storeId", async () => {
    const result = await updateReferralShareTemplate({
      template: "  推薦你來 {storeName}\n{url}  ",
    });

    expect(result).toEqual({ success: true, data: undefined });
    expect(mocks.requirePermission).toHaveBeenCalledWith("plans.edit");
    expect(mocks.resolveWriteStoreId).toHaveBeenCalledWith(
      expect.objectContaining({ id: "staff-a" }),
    );
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { storeId: "store-b" },
      create: {
        storeId: "store-b",
        referralShareTemplate: "推薦你來 {storeName}\n{url}",
      },
      update: {
        referralShareTemplate: "推薦你來 {storeName}\n{url}",
      },
    });
  });

  it("缺少必要網址變數時拒絕且不寫 DB", async () => {
    const result = await updateReferralShareTemplate({
      template: "推薦你來 {storeName}",
    });

    expect(result).toEqual({
      success: false,
      error: "推薦分享模板必須包含 {url}",
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("空白模板寫成 null，回到系統 fallback", async () => {
    const result = await updateReferralShareTemplate({
      template: " \n ",
    });

    expect(result).toEqual({ success: true, data: undefined });
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { storeId: "store-b" },
      create: {
        storeId: "store-b",
        referralShareTemplate: null,
      },
      update: { referralShareTemplate: null },
    });
  });
});
