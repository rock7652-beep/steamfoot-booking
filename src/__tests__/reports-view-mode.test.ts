import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { UserRole } from "@prisma/client";

const STORE_PARENT = "store-parent";
const STORE_CHILD = "store-child";

const mockAuth = vi.fn();
const mockCheckPermission = vi.fn();
const mockRequireStaffSession = vi.fn();
const mockTransactionGroupBy = vi.fn();
const mockTransactionAggregate = vi.fn();
const mockBookingCount = vi.fn();
const mockBookingGroupBy = vi.fn();
const mockCashbookGroupBy = vi.fn();
const mockSpaceFeeAggregate = vi.fn();
const mockSpaceFeeFindMany = vi.fn();
const mockCustomerGroupBy = vi.fn();
const mockStaffFindMany = vi.fn();
const mockGetStoreRevenueSummary = vi.fn();
const mockGetCoachRevenueSummary = vi.fn();
const mockGetTransactionDetails = vi.fn();
const mockGetRevenueKpi = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

vi.mock("@/lib/session", () => ({
  requireStaffSession: (...args: unknown[]) => mockRequireStaffSession(...args),
}));

vi.mock("@/lib/permissions", () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
  isOwner: (role: string) => role === "ADMIN",
  isNonOwnerStaff: (role: string) => role === "OWNER" || role === "PARTNER",
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    transaction: {
      groupBy: (...args: unknown[]) => mockTransactionGroupBy(...args),
      aggregate: (...args: unknown[]) => mockTransactionAggregate(...args),
    },
    booking: {
      count: (...args: unknown[]) => mockBookingCount(...args),
      groupBy: (...args: unknown[]) => mockBookingGroupBy(...args),
    },
    cashbookEntry: {
      groupBy: (...args: unknown[]) => mockCashbookGroupBy(...args),
    },
    spaceFeeRecord: {
      aggregate: (...args: unknown[]) => mockSpaceFeeAggregate(...args),
      findMany: (...args: unknown[]) => mockSpaceFeeFindMany(...args),
    },
    customer: {
      groupBy: (...args: unknown[]) => mockCustomerGroupBy(...args),
    },
    staff: {
      findMany: (...args: unknown[]) => mockStaffFindMany(...args),
    },
  },
}));

vi.mock("@/lib/manager-visibility", () => ({
  getVisibilityMode: () => "STORE_SHARED",
  getStoreFilter: (_user: unknown, activeStoreId?: string | null) =>
    activeStoreId ? { storeId: activeStoreId } : {},
  getManagerReadFilter: (
    _role: string,
    _staffId: string | null,
    _filterField: string,
    storeId?: string | null,
  ) => (storeId ? { storeId } : {}),
}));

vi.mock("@/lib/store-view-context-server", () => ({
  resolveStoreViewContextFromCookie: vi.fn().mockResolvedValue({
    ownStoreId: STORE_PARENT,
    viewedStoreId: STORE_CHILD,
    isViewMode: true,
    canWrite: false,
  }),
  storeIdForViewContext: (
    fallbackStoreId: string | null,
    viewContext: { isViewMode: boolean; viewedStoreId: string | null } | null,
  ) =>
    viewContext?.isViewMode
      ? viewContext.viewedStoreId ?? fallbackStoreId
      : fallbackStoreId,
  userForViewContext: <T extends { storeId?: string | null }>(
    user: T,
    viewContext: { isViewMode: boolean; viewedStoreId: string | null } | null,
  ): T =>
    viewContext?.isViewMode && viewContext.viewedStoreId
      ? { ...user, storeId: viewContext.viewedStoreId }
      : user,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "active-store-id" ? { value: STORE_PARENT } : undefined,
  })),
}));

vi.mock("@/lib/report-queries", () => ({
  getStoreRevenueSummary: (...args: unknown[]) => mockGetStoreRevenueSummary(...args),
  getCoachRevenueSummary: (...args: unknown[]) => mockGetCoachRevenueSummary(...args),
  getTransactionDetails: (...args: unknown[]) => mockGetTransactionDetails(...args),
  getRevenueKpi: (...args: unknown[]) => mockGetRevenueKpi(...args),
}));

function viewedStoreUser() {
  return {
    id: "user-parent",
    name: "Parent Store Owner",
    email: "owner@example.com",
    role: "OWNER" as UserRole,
    staffId: "staff-parent",
    customerId: null,
    storeId: STORE_PARENT,
    storeSlug: "parent",
  };
}

describe("reports view mode support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: viewedStoreUser() });
    mockCheckPermission.mockResolvedValue(true);
    mockRequireStaffSession.mockResolvedValue(viewedStoreUser());
    mockTransactionGroupBy.mockResolvedValue([]);
    mockTransactionAggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockBookingCount.mockResolvedValue(0);
    mockBookingGroupBy.mockResolvedValue([]);
    mockCashbookGroupBy.mockResolvedValue([]);
    mockSpaceFeeAggregate.mockResolvedValue({ _sum: { feeAmount: 0 } });
    mockSpaceFeeFindMany.mockResolvedValue([]);
    mockCustomerGroupBy.mockResolvedValue([]);
    mockStaffFindMany.mockResolvedValue([
      { id: "staff-child", displayName: "Child Store Staff" },
    ]);
    mockGetStoreRevenueSummary.mockResolvedValue([]);
    mockGetCoachRevenueSummary.mockResolvedValue([]);
    mockGetTransactionDetails.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 50 });
    mockGetRevenueKpi.mockResolvedValue({
      totalRevenue: 0,
      refundAmount: 0,
      netRevenue: 0,
      txCount: 0,
      customerCount: 0,
      avgPerCustomer: 0,
    });
  });

  it("uses viewedStoreId for monthly report reads", async () => {
    const { monthlyStoreSummary } = await import("@/server/queries/report");

    await monthlyStoreSummary("2026-06", { activeStoreId: STORE_PARENT });

    expect(mockStaffFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: STORE_CHILD }),
      }),
    );
    expect(mockTransactionGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: STORE_CHILD }),
      }),
    );
  });

  it("forces store revenue API reads to the viewed store", async () => {
    const { GET } = await import("@/app/api/reports/store-revenue/route");

    const res = await GET(
      new NextRequest(
        "http://localhost/api/reports/store-revenue?startDate=2026-06-01&endDate=2026-07-01&storeId=store-sibling",
      ),
    );

    expect(res.status).toBe(200);
    expect(mockGetStoreRevenueSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: STORE_CHILD,
        storeFilter: expect.objectContaining({ storeId: STORE_CHILD }),
      }),
    );
  });

  it("blocks direct reports export URLs in view mode", async () => {
    const [{ GET: getExcel }, { GET: getStoreCsv }, { GET: getStaffCsv }] =
      await Promise.all([
        import("@/app/api/reports/export/route"),
        import("@/app/api/export/store-monthly/route"),
        import("@/app/api/export/staff-monthly/route"),
      ]);

    const excel = await getExcel(
      new NextRequest(
        "http://localhost/api/reports/export?startDate=2026-06-01&endDate=2026-07-01",
      ),
    );
    const storeCsv = await getStoreCsv(
      new NextRequest("http://localhost/api/export/store-monthly?month=2026-06"),
    );
    const staffCsv = await getStaffCsv(
      new NextRequest("http://localhost/api/export/staff-monthly?month=2026-06"),
    );

    expect([excel.status, storeCsv.status, staffCsv.status]).toEqual([403, 403, 403]);
  });
});
