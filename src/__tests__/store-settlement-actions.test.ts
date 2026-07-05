import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireWritablePermission = vi.fn();
const mockResolveWriteStoreId = vi.fn();
const mockResolveStoreViewContextFromCookie = vi.fn();
const mockRequireStoreFeature = vi.fn();
const mockSaveStoreSettlementForStore = vi.fn();
const mockConfirmStoreSettlementForStore = vi.fn();
const mockReopenStoreSettlementForStore = vi.fn();
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

vi.mock("@/lib/feature-flags", () => ({
  FEATURES: {
    SERVICE_FEE_CALCULATOR: "service_fee_calculator",
  },
}));

vi.mock("@/lib/feature-gate", () => ({
  requireStoreFeature: (...args: unknown[]) => mockRequireStoreFeature(...args),
}));

vi.mock("@/lib/store-view-context-server", () => ({
  resolveStoreViewContextFromCookie: (...args: unknown[]) =>
    mockResolveStoreViewContextFromCookie(...args),
  storeIdForViewContext: (fallbackStoreId: string | null, viewContext: { viewedStoreId?: string } | null) =>
    viewContext?.viewedStoreId ?? fallbackStoreId,
}));

vi.mock("@/server/services/store-settlements", () => ({
  saveStoreSettlementForStore: (...args: unknown[]) => mockSaveStoreSettlementForStore(...args),
  confirmStoreSettlementForStore: (...args: unknown[]) =>
    mockConfirmStoreSettlementForStore(...args),
  reopenStoreSettlementForStore: (...args: unknown[]) =>
    mockReopenStoreSettlementForStore(...args),
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
    mockRequireStoreFeature.mockResolvedValue(undefined);
    mockSaveStoreSettlementForStore.mockResolvedValue({ id: "settlement-1", status: "DRAFT" });
    mockConfirmStoreSettlementForStore.mockResolvedValue({
      id: "settlement-1",
      status: "CONFIRMED",
    });
    mockReopenStoreSettlementForStore.mockResolvedValue({
      id: "settlement-1",
      status: "DRAFT",
    });
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
    expect(mockRequireStoreFeature).toHaveBeenCalledWith(
      "store-1",
      "service_fee_calculator",
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

  it("returns locked result instead of 500 when saving a CONFIRMED settlement", async () => {
    mockSaveStoreSettlementForStore.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "此月結已確認，若需修改請先解除確認"),
    );
    const { saveStoreSettlementAction } = await import("@/server/actions/store-settlement");

    const result = await saveStoreSettlementAction(validFormData());

    expect(result).toEqual({
      success: false,
      error: "此月結已確認，若需修改請先解除確認",
    });
  });

  it("does not allow formData to choose another store when confirming", async () => {
    const { confirmStoreSettlementAction } = await import("@/server/actions/store-settlement");

    const result = await confirmStoreSettlementAction(validFormData());

    expect(result).toEqual({
      success: true,
      data: { id: "settlement-1", status: "CONFIRMED" },
    });
    expect(mockRequireStoreFeature).toHaveBeenCalledWith(
      "store-1",
      "service_fee_calculator",
    );
    expect(mockConfirmStoreSettlementForStore).toHaveBeenCalledWith({
      storeId: "store-1",
      month: "2026-07",
      userId: "user-1",
    });
    expect(mockConfirmStoreSettlementForStore).not.toHaveBeenCalledWith(
      expect.objectContaining({ storeId: "evil-store" }),
    );
  });

  it("reopens a confirmed settlement without trusting formData storeId", async () => {
    const { reopenStoreSettlementAction } = await import("@/server/actions/store-settlement");

    const result = await reopenStoreSettlementAction(validFormData());

    expect(result).toEqual({
      success: true,
      data: { id: "settlement-1", status: "DRAFT" },
    });
    expect(mockRequireStoreFeature).toHaveBeenCalledWith(
      "store-1",
      "service_fee_calculator",
    );
    expect(mockReopenStoreSettlementForStore).toHaveBeenCalledWith({
      storeId: "store-1",
      month: "2026-07",
      userId: "user-1",
    });
    expect(mockReopenStoreSettlementForStore).not.toHaveBeenCalledWith(
      expect.objectContaining({ storeId: "evil-store" }),
    );
  });

  it("does not save when service_fee_calculator is not enabled", async () => {
    mockRequireStoreFeature.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "此功能尚未開通，請聯絡總部加購或升級方案"),
    );
    const { saveStoreSettlementAction } = await import("@/server/actions/store-settlement");

    const result = await saveStoreSettlementAction(validFormData());

    expect(result).toEqual({
      success: false,
      error: "此功能尚未開通，請聯絡總部加購或升級方案",
    });
    expect(mockSaveStoreSettlementForStore).not.toHaveBeenCalled();
  });

  it("does not confirm when service_fee_calculator is not enabled", async () => {
    mockRequireStoreFeature.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "此功能尚未開通，請聯絡總部加購或升級方案"),
    );
    const { confirmStoreSettlementAction } = await import("@/server/actions/store-settlement");

    const result = await confirmStoreSettlementAction(validFormData());

    expect(result).toEqual({
      success: false,
      error: "此功能尚未開通，請聯絡總部加購或升級方案",
    });
    expect(mockConfirmStoreSettlementForStore).not.toHaveBeenCalled();
  });

  it("does not reopen when service_fee_calculator is not enabled", async () => {
    mockRequireStoreFeature.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "此功能尚未開通，請聯絡總部加購或升級方案"),
    );
    const { reopenStoreSettlementAction } = await import("@/server/actions/store-settlement");

    const result = await reopenStoreSettlementAction(validFormData());

    expect(result).toEqual({
      success: false,
      error: "此功能尚未開通，請聯絡總部加購或升級方案",
    });
    expect(mockReopenStoreSettlementForStore).not.toHaveBeenCalled();
  });
});
