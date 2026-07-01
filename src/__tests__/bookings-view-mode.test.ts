import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@prisma/client";

const mockBookingFindMany = vi.fn();
const mockBookingFindFirst = vi.fn();
const mockBookingCount = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: {
      findMany: (...args: unknown[]) => mockBookingFindMany(...args),
      findFirst: (...args: unknown[]) => mockBookingFindFirst(...args),
      count: (...args: unknown[]) => mockBookingCount(...args),
    },
  },
}));

const mockRequireSession = vi.fn();
const mockRequireStaffSession = vi.fn();

vi.mock("@/lib/session", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
  requireStaffSession: (...args: unknown[]) => mockRequireStaffSession(...args),
}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));

vi.mock("@/lib/store-view-context-server", () => ({
  resolveStoreViewContextFromCookie: vi.fn().mockResolvedValue({
    ownStoreId: "store-parent",
    viewedStoreId: "store-child",
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
  userForViewContext: <
    T extends { storeId?: string | null },
  >(
    user: T,
    viewContext: { isViewMode: boolean; viewedStoreId: string | null } | null,
  ): T =>
    viewContext?.isViewMode && viewContext.viewedStoreId
      ? { ...user, storeId: viewContext.viewedStoreId }
      : user,
}));

function viewedStoreUser() {
  return {
    id: "user-parent",
    name: "Parent Store Owner",
    email: "owner@example.com",
    role: "OWNER" as UserRole,
    staffId: "staff-parent",
    customerId: null,
    storeId: "store-parent",
    storeSlug: "parent",
  };
}

describe("bookings view mode support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue(viewedStoreUser());
    mockRequireStaffSession.mockResolvedValue(viewedStoreUser());
    mockBookingFindMany.mockResolvedValue([]);
    mockBookingCount.mockResolvedValue(0);
    mockBookingFindFirst.mockResolvedValue({
      id: "booking-child",
      storeId: "store-child",
      customer: { id: "customer-child", name: "Child Customer" },
      revenueStaff: null,
      serviceStaff: null,
      servicePlan: null,
      customerPlanWallet: null,
    });
  });

  it("uses viewedStoreId for booking list queries", async () => {
    const { listBookings } = await import("@/server/queries/booking");

    await listBookings({ activeStoreId: "store-child" });

    expect(mockBookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: "store-child" }),
      }),
    );
    expect(mockBookingCount).toHaveBeenCalledWith({
      where: expect.objectContaining({ storeId: "store-child" }),
    });
  });

  it("uses viewedStoreId for day booking queries", async () => {
    const { getDayBookings } = await import("@/server/queries/booking");

    await getDayBookings("2026-07-01", "store-child");

    expect(mockBookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-child",
          bookingStatus: expect.any(Object),
        }),
      }),
    );
  });

  it("uses viewedStoreId for booking detail queries", async () => {
    const { getBookingDetailForUser } = await import("@/server/queries/booking");

    await getBookingDetailForUser(
      "booking-child",
      { ...viewedStoreUser(), storeId: "store-child" },
      "store-child",
    );

    expect(mockBookingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "booking-child",
          storeId: "store-child",
        }),
      }),
    );
  });
});
