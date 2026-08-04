import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.fn();
const mockCheckPermission = vi.fn();
const mockTransactionFindMany = vi.fn();
const mockAuditCreate = vi.fn();
const mockResolveActiveStoreId = vi.fn();
const mockResolveStoreViewContext = vi.fn();

vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));
vi.mock("@/lib/permissions", () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
  isOwner: (role: string) => role === "ADMIN",
  isNonOwnerStaff: (role: string) => role === "OWNER" || role === "PARTNER",
}));
vi.mock("@/lib/data-export-gate", () => ({ requireDataExportFeature: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/store", () => ({
  resolveActiveStoreId: (...args: unknown[]) => mockResolveActiveStoreId(...args),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    transaction: { findMany: (...args: unknown[]) => mockTransactionFindMany(...args) },
    auditLog: { create: (...args: unknown[]) => mockAuditCreate(...args) },
  },
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => name === "active-store-id" ? { value: "store-parent" } : undefined,
  })),
}));
vi.mock("@/lib/store-view-context-server", () => ({
  resolveStoreViewContextFromCookie: (...args: unknown[]) => mockResolveStoreViewContext(...args),
  storeIdForViewContext: (
    fallbackStoreId: string | null,
    viewContext: { isViewMode: boolean; viewedStoreId: string | null } | null,
  ) => viewContext?.isViewMode ? viewContext.viewedStoreId ?? fallbackStoreId : fallbackStoreId,
  userForViewContext: <T extends { storeId?: string | null }>(
    user: T,
    viewContext: { isViewMode: boolean; viewedStoreId: string | null } | null,
  ): T => viewContext?.isViewMode && viewContext.viewedStoreId
    ? { ...user, storeId: viewContext.viewedStoreId }
    : user,
}));

function exportRequest() {
  return new NextRequest(
    "http://localhost/api/data-export?type=transactions&startDate=2026-08-01&endDate=2026-08-31",
  );
}

describe("data export store and manager isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MANAGER_VISIBILITY_MODE = "SELF_ONLY";
    mockCheckPermission.mockImplementation(async (_role, _staffId, permission) => permission === "report.export");
    mockResolveActiveStoreId.mockResolvedValue("store-parent");
    mockResolveStoreViewContext.mockResolvedValue(null);
    mockTransactionFindMany.mockResolvedValue([]);
    mockAuditCreate.mockResolvedValue({});
  });

  it("limits SELF_ONLY transaction exports to the signed-in manager", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "owner-1", role: "OWNER", staffId: "staff-1", storeId: "store-parent" },
    });

    const { GET } = await import("@/app/api/data-export/route");
    const response = await GET(exportRequest());

    expect(response.status).toBe(200);
    expect(mockTransactionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: "store-parent", revenueStaffId: "staff-1" }),
    }));
  });

  it("uses the viewed descendant store for the query and audit log", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "owner-1", role: "OWNER", staffId: "staff-1", storeId: "store-parent" },
    });
    mockResolveStoreViewContext.mockResolvedValue({
      ownStoreId: "store-parent",
      viewedStoreId: "store-child",
      isViewMode: true,
      canWrite: false,
    });

    const { GET } = await import("@/app/api/data-export/route");
    const response = await GET(exportRequest());

    expect(response.status).toBe(200);
    expect(mockTransactionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: "store-child", revenueStaffId: "staff-1" }),
    }));
    expect(mockAuditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        afterJson: expect.objectContaining({ storeId: "store-child" }),
      }),
    }));
  });
});
