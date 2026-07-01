import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@prisma/client";

const mockCustomerFindMany = vi.fn();
const mockCustomerFindFirst = vi.fn();
const mockCustomerCount = vi.fn();
const mockBookingGroupBy = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findMany: (...args: unknown[]) => mockCustomerFindMany(...args),
      findFirst: (...args: unknown[]) => mockCustomerFindFirst(...args),
      count: (...args: unknown[]) => mockCustomerCount(...args),
    },
    booking: {
      groupBy: (...args: unknown[]) => mockBookingGroupBy(...args),
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
  requireSession: vi.fn(),
  requireStaffSession: vi.fn(),
}));

function viewedStoreUser() {
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

describe("customers view mode support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomerFindMany.mockResolvedValue([]);
    mockCustomerCount.mockResolvedValue(0);
    mockBookingGroupBy.mockResolvedValue([]);
    mockCustomerFindFirst.mockResolvedValue({
      id: "customer-child",
      storeId: "store-child",
      mergedIntoCustomerId: null,
      user: null,
      planWallets: [],
      bookings: [],
      transactions: [],
      followUps: [],
      _count: { sponsoredCustomers: 0, bookings: 0 },
    });
  });

  it("uses viewedStoreId for customers list queries", async () => {
    const { listCustomersForUser } = await import("@/server/queries/customer");

    await listCustomersForUser(viewedStoreUser(), {
      activeStoreId: "store-child",
      page: 1,
      pageSize: 20,
    });

    expect(mockCustomerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: "store-child" }),
      }),
    );
    expect(mockCustomerCount).toHaveBeenCalledWith({
      where: expect.objectContaining({ storeId: "store-child" }),
    });
  });

  it("uses viewedStoreId for customer detail queries", async () => {
    const { getCustomerDetailForUser } = await import("@/server/queries/customer");

    await getCustomerDetailForUser(
      viewedStoreUser(),
      "customer-child",
      "store-child",
    );

    expect(mockCustomerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "customer-child",
          storeId: "store-child",
        }),
      }),
    );
  });
});
