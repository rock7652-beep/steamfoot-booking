import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import {
  DATA_EXPORT_LOCKED_MESSAGE,
  DATA_EXPORT_SELECT_STORE_MESSAGE,
} from "@/lib/data-export-gate";

const mockAuth = vi.fn();
const mockCheckPermission = vi.fn();
const mockRequireStoreFeature = vi.fn();
const mockCustomerFindMany = vi.fn();
const mockGetStoreRevenueSummary = vi.fn();
const mockGetCoachRevenueSummary = vi.fn();
const mockGetTransactionDetails = vi.fn();

let activeStoreCookie: string | null = "store-1";

vi.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

vi.mock("@/lib/permissions", () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
  isOwner: (role: string) => role === "ADMIN",
}));

vi.mock("@/lib/feature-gate", () => ({
  requireStoreFeature: (...args: unknown[]) => mockRequireStoreFeature(...args),
  hasStoreFeature: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findMany: (...args: unknown[]) => mockCustomerFindMany(...args),
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "active-store-id" && activeStoreCookie
        ? { value: activeStoreCookie }
        : undefined,
  })),
}));

vi.mock("@/lib/store-view-context-server", () => ({
  resolveStoreViewContextFromCookie: vi.fn().mockResolvedValue(null),
  storeIdForViewContext: (fallbackStoreId: string | null) => fallbackStoreId,
  userForViewContext: <T>(user: T): T => user,
}));

vi.mock("@/lib/report-queries", () => ({
  getStoreRevenueSummary: (...args: unknown[]) => mockGetStoreRevenueSummary(...args),
  getCoachRevenueSummary: (...args: unknown[]) => mockGetCoachRevenueSummary(...args),
  getTransactionDetails: (...args: unknown[]) => mockGetTransactionDetails(...args),
}));

function adminUser() {
  return {
    id: "admin-1",
    role: "ADMIN",
    staffId: "staff-admin",
    storeId: null,
  };
}

describe("data_export route gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeStoreCookie = "store-1";
    mockAuth.mockResolvedValue({ user: adminUser() });
    mockCheckPermission.mockResolvedValue(true);
    mockRequireStoreFeature.mockResolvedValue(undefined);
    mockCustomerFindMany.mockResolvedValue([]);
    mockGetStoreRevenueSummary.mockResolvedValue([]);
    mockGetCoachRevenueSummary.mockResolvedValue([]);
    mockGetTransactionDetails.mockResolvedValue({ data: [] });
  });

  it("blocks direct customer CSV export when data_export is disabled", async () => {
    mockRequireStoreFeature.mockRejectedValue(
      new AppError("FORBIDDEN", DATA_EXPORT_LOCKED_MESSAGE),
    );

    const { GET } = await import("@/app/api/export/customers/route");
    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.text()).toBe(DATA_EXPORT_LOCKED_MESSAGE);
    expect(mockRequireStoreFeature).toHaveBeenCalledWith("store-1", "data_export");
    expect(mockCustomerFindMany).not.toHaveBeenCalled();
  });

  it("blocks direct report Excel export when data_export is disabled", async () => {
    mockRequireStoreFeature.mockRejectedValue(
      new AppError("FORBIDDEN", DATA_EXPORT_LOCKED_MESSAGE),
    );

    const { GET } = await import("@/app/api/reports/export/route");
    const response = await GET(
      new NextRequest(
        "http://localhost/api/reports/export?startDate=2026-07-01&endDate=2026-07-31&storeId=store-1",
      ),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe(DATA_EXPORT_LOCKED_MESSAGE);
    expect(mockRequireStoreFeature).toHaveBeenCalledWith("store-1", "data_export");
    expect(mockGetStoreRevenueSummary).not.toHaveBeenCalled();
    expect(mockGetCoachRevenueSummary).not.toHaveBeenCalled();
    expect(mockGetTransactionDetails).not.toHaveBeenCalled();
  });

  it("requires ADMIN all-store exports to switch to a concrete store", async () => {
    activeStoreCookie = "__all__";

    const { GET } = await import("@/app/api/export/customers/route");
    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.text()).toBe(DATA_EXPORT_SELECT_STORE_MESSAGE);
    expect(mockRequireStoreFeature).not.toHaveBeenCalled();
    expect(mockCustomerFindMany).not.toHaveBeenCalled();
  });
});
