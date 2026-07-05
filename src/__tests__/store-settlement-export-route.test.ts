import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import type { StoreSettlementRecord } from "@/server/services/store-settlements";

const mockRequirePermission = vi.fn();
const mockGetActiveStoreForRead = vi.fn();
const mockResolveStoreViewContextFromCookie = vi.fn();
const mockRequireStoreFeature = vi.fn();
const mockGetStoreSettlementForStoreByMonth = vi.fn();

vi.mock("@/lib/permissions", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/store", () => ({
  getActiveStoreForRead: (...args: unknown[]) => mockGetActiveStoreForRead(...args),
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
  storeIdForViewContext: (
    fallbackStoreId: string | null,
    viewContext: { viewedStoreId?: string | null; isViewMode?: boolean } | null,
  ) => (viewContext?.isViewMode ? viewContext.viewedStoreId ?? fallbackStoreId : fallbackStoreId),
}));

vi.mock("@/server/services/store-settlements", async () => {
  const actual = await vi.importActual<typeof import("@/server/services/store-settlements")>(
    "@/server/services/store-settlements",
  );
  return {
    ...actual,
    getStoreSettlementForStoreByMonth: (...args: unknown[]) =>
      mockGetStoreSettlementForStoreByMonth(...args),
  };
});

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    role: "OWNER",
    staffId: "staff-1",
    storeId: "store-1",
    ...overrides,
  };
}

function settlement(overrides: Partial<StoreSettlementRecord> = {}): StoreSettlementRecord {
  return {
    id: "settlement-1",
    storeId: "store-1",
    storeName: "測試店",
    month: "2026-07",
    grossRevenue: 12000,
    refundAmount: 2000,
    netRevenue: 10000,
    transactionCount: 5,
    fixedMonthlyFee: 3000,
    revenueShareRate: 10,
    revenueShareAmount: 1000,
    additionalAmount: 500,
    deductionAmount: 200,
    finalReceivable: 12300,
    note: "本月調整",
    status: "CONFIRMED",
    createdAt: new Date("2026-07-05T00:00:00.000Z"),
    updatedAt: new Date("2026-07-05T01:00:00.000Z"),
    ...overrides,
  };
}

describe("store settlement CSV export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(user());
    mockGetActiveStoreForRead.mockResolvedValue("store-1");
    mockResolveStoreViewContextFromCookie.mockResolvedValue(null);
    mockRequireStoreFeature.mockResolvedValue(undefined);
    mockGetStoreSettlementForStoreByMonth.mockResolvedValue(settlement());
  });

  it("exports the selected month settlement as CSV for the resolved store", async () => {
    const { GET } = await import("@/app/api/store-settlements/export/route");

    const response = await GET(
      new NextRequest("http://localhost/api/store-settlements/export?month=2026-07"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain("store-settlement");
    expect(mockRequirePermission).toHaveBeenCalledWith("report.read");
    expect(mockRequireStoreFeature).toHaveBeenCalledWith(
      "store-1",
      "service_fee_calculator",
    );
    expect(mockGetStoreSettlementForStoreByMonth).toHaveBeenCalledWith("store-1", "2026-07");
    const body = await response.text();
    expect(body).toContain("店舖名稱,月份,狀態");
    expect(body).toContain("測試店,2026-07,CONFIRMED");
    expect(body).toContain("12300");
  });

  it("uses viewed store context instead of allowing cross-store export", async () => {
    mockGetActiveStoreForRead.mockResolvedValue("parent-store");
    mockResolveStoreViewContextFromCookie.mockResolvedValue({
      isViewMode: true,
      viewedStoreId: "child-store",
    });
    const { GET } = await import("@/app/api/store-settlements/export/route");

    await GET(new NextRequest("http://localhost/api/store-settlements/export?month=2026-07"));

    expect(mockGetStoreSettlementForStoreByMonth).toHaveBeenCalledWith(
      "child-store",
      "2026-07",
    );
    expect(mockGetStoreSettlementForStoreByMonth).not.toHaveBeenCalledWith(
      "parent-store",
      "2026-07",
    );
  });

  it("returns a friendly 404 when the month has no saved settlement", async () => {
    mockGetStoreSettlementForStoreByMonth.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/store-settlements/export/route");

    const response = await GET(
      new NextRequest("http://localhost/api/store-settlements/export?month=2026-08"),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("此月份尚未儲存月結單，請先儲存本月試算");
  });

  it("does not query when month format is invalid", async () => {
    const { GET } = await import("@/app/api/store-settlements/export/route");

    const response = await GET(
      new NextRequest("http://localhost/api/store-settlements/export?month=2026-13"),
    );

    expect(response.status).toBe(400);
    expect(mockGetStoreSettlementForStoreByMonth).not.toHaveBeenCalled();
  });

  it("maps permission errors to forbidden responses", async () => {
    mockRequirePermission.mockRejectedValueOnce(new AppError("FORBIDDEN", "您沒有此操作的權限"));
    const { GET } = await import("@/app/api/store-settlements/export/route");

    const response = await GET(
      new NextRequest("http://localhost/api/store-settlements/export?month=2026-07"),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("您沒有此操作的權限");
    expect(mockGetStoreSettlementForStoreByMonth).not.toHaveBeenCalled();
  });

  it("returns forbidden and does not export when service_fee_calculator is disabled", async () => {
    mockRequireStoreFeature.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "此功能尚未開通，請聯絡總部加購或升級方案"),
    );
    const { GET } = await import("@/app/api/store-settlements/export/route");

    const response = await GET(
      new NextRequest("http://localhost/api/store-settlements/export?month=2026-07"),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("此功能尚未開通，請聯絡總部加購或升級方案");
    expect(mockRequireStoreFeature).toHaveBeenCalledWith(
      "store-1",
      "service_fee_calculator",
    );
    expect(mockGetStoreSettlementForStoreByMonth).not.toHaveBeenCalled();
  });
});
