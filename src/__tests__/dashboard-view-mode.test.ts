import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@prisma/client";

const mockBookingAggregate = vi.fn();
const mockBookingCount = vi.fn();
const mockBookingFindMany = vi.fn();
const mockTransactionAggregate = vi.fn();
const mockTransactionFindMany = vi.fn();
const mockCustomerCount = vi.fn();
const mockCustomerFindMany = vi.fn();
const mockCustomerPlanWalletFindMany = vi.fn();
const mockTodoDismissFindMany = vi.fn();
const mockStaffPermissionFindMany = vi.fn();
const mockRequireStaffSession = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: {
      aggregate: (...args: unknown[]) => mockBookingAggregate(...args),
      count: (...args: unknown[]) => mockBookingCount(...args),
      findMany: (...args: unknown[]) => mockBookingFindMany(...args),
    },
    transaction: {
      aggregate: (...args: unknown[]) => mockTransactionAggregate(...args),
      findMany: (...args: unknown[]) => mockTransactionFindMany(...args),
    },
    customer: {
      count: (...args: unknown[]) => mockCustomerCount(...args),
      findMany: (...args: unknown[]) => mockCustomerFindMany(...args),
    },
    customerPlanWallet: {
      findMany: (...args: unknown[]) => mockCustomerPlanWalletFindMany(...args),
    },
    todoDismiss: {
      findMany: (...args: unknown[]) => mockTodoDismissFindMany(...args),
    },
    staffPermission: {
      findMany: (...args: unknown[]) => mockStaffPermissionFindMany(...args),
    },
  },
}));

vi.mock("react", () => ({
  cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));

vi.mock("@/lib/session", () => ({
  requireStaffSession: (...args: unknown[]) => mockRequireStaffSession(...args),
}));

function viewModeDashboardUser() {
  return {
    id: "user-parent",
    name: "Parent Store Owner",
    email: "owner@example.com",
    role: "OWNER" as UserRole,
    staffId: "staff-parent",
    customerId: null,
    storeId: "store-child",
    storeSlug: "child",
  };
}

describe("dashboard view mode support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStaffPermissionFindMany.mockResolvedValue([
      { permission: "transaction.create" },
    ]);

    mockBookingAggregate.mockResolvedValue({
      _count: { id: 0 },
      _sum: { people: 0 },
    });
    mockBookingCount.mockResolvedValue(0);
    mockTransactionAggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockCustomerCount.mockResolvedValue(0);

    mockTransactionFindMany.mockResolvedValue([]);
    mockBookingFindMany.mockResolvedValue([]);
    mockCustomerFindMany.mockResolvedValue([]);
    mockCustomerPlanWalletFindMany.mockResolvedValue([]);
    mockTodoDismissFindMany.mockResolvedValue([]);
  });

  it("uses viewedStoreId for dashboard summary queries", async () => {
    const { getDashboardTodaySummaryForUser } = await import(
      "@/server/queries/dashboard-summary"
    );

    await getDashboardTodaySummaryForUser(viewModeDashboardUser(), "store-child");

    for (const [query] of mockBookingAggregate.mock.calls) {
      expect(query.where.storeId).toBe("store-child");
    }
    for (const [query] of mockBookingCount.mock.calls) {
      expect(query.where.storeId).toBe("store-child");
    }
    expect(mockTransactionAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: "store-child" }),
      }),
    );
    expect(mockCustomerCount).toHaveBeenCalledWith({
      where: { storeId: "store-child" },
    });
  });

  it("uses viewedStoreId for store todos and ignores parent-user dismissed state", async () => {
    const { getStoreTodosForUser } = await import("@/server/queries/store-todos");

    await getStoreTodosForUser(viewModeDashboardUser(), {
      activeStoreId: "store-child",
      respectDismissed: false,
    });

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: "store-child" }),
      }),
    );
    expect(mockBookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: "store-child" }),
      }),
    );
    expect(mockCustomerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: "store-child" }),
      }),
    );
    expect(mockCustomerPlanWalletFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: "store-child" }),
      }),
    );
    expect(mockTodoDismissFindMany).not.toHaveBeenCalled();
  });
});
