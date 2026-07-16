import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  resolveWriteStoreId: vi.fn(),
  upsert: vi.fn(),
  ensureTrialPlan: vi.fn(),
  revalidateShopConfig: vi.fn(),
  revalidateDutyScheduling: vi.fn(),
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: { shopConfig: { upsert: mocks.upsert } } }));
vi.mock("@/lib/session", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: mocks.resolveWriteStoreId }));
vi.mock("@/lib/revalidation", () => ({
  revalidateShopConfig: mocks.revalidateShopConfig,
  revalidateDutyScheduling: mocks.revalidateDutyScheduling,
}));
vi.mock("@/server/services/trial-plan", () => ({ ensureTrialPlan: mocks.ensureTrialPlan }));
vi.mock("next/cache", () => ({
  updateTag: mocks.updateTag,
  revalidatePath: mocks.revalidatePath,
}));

import { updateShopBankInfo, updateTrialSettings } from "@/server/actions/shop";

describe("per-store ShopConfig mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ role: "ADMIN", storeId: null });
    mocks.resolveWriteStoreId.mockResolvedValue("branch-a");
    mocks.upsert.mockResolvedValue({ id: "config-a" });
  });

  it("writes bank and LINE fields only to the resolved active store", async () => {
    const result = await updateShopBankInfo({
      bankName: " A Bank ",
      bankCode: "001",
      bankAccountNumber: "123",
      lineOfficialUrl: "https://lin.ee/a",
    });

    expect(result.success).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { storeId: "branch-a" },
      create: {
        storeId: "branch-a",
        bankName: "A Bank",
        bankCode: "001",
        bankAccountNumber: "123",
        lineOfficialUrl: "https://lin.ee/a",
      },
      update: {
        bankName: "A Bank",
        bankCode: "001",
        bankAccountNumber: "123",
        lineOfficialUrl: "https://lin.ee/a",
      },
    });
  });

  it("writes trial settings and ensures the canonical plan in the same store", async () => {
    const settings = {
      trialEnabled: true,
      trialDefaultPrice: 699,
      trialAllowPriceEdit: true,
      trialMinPrice: 500,
      trialMaxPrice: 900,
    };
    const result = await updateTrialSettings(settings);

    expect(result.success).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { storeId: "branch-a" },
      create: { storeId: "branch-a", ...settings },
      update: settings,
    });
    expect(mocks.ensureTrialPlan).toHaveBeenCalledWith("branch-a", 699);
  });
});
