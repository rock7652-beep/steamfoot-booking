import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireWritablePermission = vi.fn();
const mockResolveWriteStoreId = vi.fn();
const mockResolveStoreViewContextFromCookie = vi.fn();
const mockSaveStoreSettlementForStore = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock("@/lib/permissions", () => ({
  requirePermission: vi.fn(),
  requireWritablePermission: (...args: unknown[]) => mockRequireWritablePermission(...args),
}));

vi.mock("@/lib/store", () => ({
  resolveWriteStoreId: (...args: unknown[]) => mockResolveWriteStoreId(...args),
}));

vi.mock("@/lib/store-view-context-server", () => ({
  resolveStoreViewContextFromCookie: (...args: unknown[]) =>
    mockResolveStoreViewContextFromCookie(...args),
  storeIdForViewContext: (fallbackStoreId: string | null, viewContext: { viewedStoreId?: string } | null) =>
    viewContext?.viewedStoreId ?? fallbackStoreId,
}));

vi.mock("@/server/services/store-settlements", () => ({
  saveStoreSettlementForStore: (...args: unknown[]) => mockSaveStoreSettlementForStore(...args),
  confirmStoreSettlementForStore: vi.fn(),
  getStoreSettlementsForStore: vi.fn(),
  getStoreSettlementForStoreByMonth: vi.fn(),
}));

function validFormData(): FormData {
  const formData = new FormData();
  formData.set("storeId", "evil-store");
  formData.set("month", "2026-07");
  formData.set("grossRevenue", "12000");
  formData.set("refundAmount", "2000");
  formData.set("netRevenue", "10000");
  formData.set("transactionCount", "5");
  formData.set("fixedMonthlyFee", "3000");
  formData.set("revenueShareRate", "10");
  formData.set("additionalAmount", "500");
  formData.set("deductionAmount", "200");
  formData.set("note", "測試");
  formData.set("status", "DRAFT");
  return formData;
}

describe("store settlement actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWritablePermission.mockResolvedValue({
      id: "user-1",
      role: "OWNER",
      storeId: "store-1",
    });
    mockResolveStoreViewContextFromCookie.mockResolvedValue(null);
    mockResolveWriteStoreId.mockResolvedValue("admin-selected-store");
    mockSaveStoreSettlementForStore.mockResolvedValue({ id: "settlement-1", status: "DRAFT" });
  });

  it("does not allow formData to choose an unauthorized store", async () => {
    const { saveStoreSettlementAction } = await import("@/server/actions/store-settlement");

    const result = await saveStoreSettlementAction(validFormData());

    expect(result).toEqual({ success: true, data: { id: "settlement-1", status: "DRAFT" } });
    expect(mockSaveStoreSettlementForStore).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        userId: "user-1",
      }),
    );
    expect(mockSaveStoreSettlementForStore).not.toHaveBeenCalledWith(
      expect.objectContaining({ storeId: "evil-store" }),
    );
  });

  it("uses the selected write store for ADMIN instead of trusting formData", async () => {
    mockRequireWritablePermission.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      storeId: null,
    });
    const { saveStoreSettlementAction } = await import("@/server/actions/store-settlement");

    await saveStoreSettlementAction(validFormData());

    expect(mockResolveWriteStoreId).toHaveBeenCalledWith(
      expect.objectContaining({ role: "ADMIN" }),
    );
    expect(mockSaveStoreSettlementForStore).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "admin-selected-store",
        userId: "admin-1",
      }),
    );
  });
});
