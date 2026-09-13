import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const resolveRequestStore = vi.fn();
const resolveMembership = vi.fn();
const requireSpaStore = vi.fn();
const bookingFindMany = vi.fn();
const entitlementFindMany = vi.fn();
const staffFindMany = vi.fn();

vi.mock("@/lib/session", () => ({
  requireSession: (...args: unknown[]) => requireSession(...args),
}));
vi.mock("@/server/services/member-request-store", () => ({
  resolveMemberRequestStoreId: (...args: unknown[]) => resolveRequestStore(...args),
}));
vi.mock("@/server/services/central-member-resolver", () => ({
  resolveCentralMemberCustomerForStore: (...args: unknown[]) => resolveMembership(...args),
}));
vi.mock("@/lib/industry-module-server", () => ({
  requireSpaStore: (...args: unknown[]) => requireSpaStore(...args),
}));
vi.mock("@/lib/spa-db", () => ({
  spaPrisma: {
    spaBooking: { findMany: (...args: unknown[]) => bookingFindMany(...args) },
    spaEntitlement: { findMany: (...args: unknown[]) => entitlementFindMany(...args) },
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: { staff: { findMany: (...args: unknown[]) => staffFindMany(...args) } },
}));

import {
  fetchSpaLiffBookings,
  fetchSpaLiffEntitlements,
} from "@/server/actions/spa-liff-member";

describe("SPA LIFF member projections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSession.mockResolvedValue({ id: "user-1", storeId: "legacy-store" });
    resolveRequestStore.mockResolvedValue("spa-store");
    requireSpaStore.mockResolvedValue(undefined);
    resolveMembership.mockResolvedValue({ customerId: "customer-1" });
    bookingFindMany.mockResolvedValue([]);
    entitlementFindMany.mockResolvedValue([]);
    staffFindMany.mockResolvedValue([]);
  });

  it("authorizes the visible SPA store and never trusts a client customer id", async () => {
    await fetchSpaLiffBookings();

    expect(resolveRequestStore).toHaveBeenCalledWith("legacy-store");
    expect(requireSpaStore).toHaveBeenCalledWith("spa-store");
    expect(resolveMembership).toHaveBeenCalledWith("user-1", "spa-store");
    expect(bookingFindMany.mock.calls[0][0].where).toEqual({
      storeId: "spa-store",
      customerId: "customer-1",
    });
  });

  it("projects SpaBooking status and details from the same row used by the homepage", async () => {
    bookingFindMany.mockResolvedValue([
      {
        id: "spa-booking-1",
        bookingDate: new Date("2099-10-20T00:00:00.000Z"),
        startTime: "14:00",
        endTime: "15:30",
        status: "CONFIRMED",
        serviceStaffId: "staff-1",
        serviceNameSnapshot: "深層舒壓",
        people: 1,
        serviceLocation: { name: "美容床 1" },
        items: [{ treatmentNameSnapshot: "臉部保濕護理" }],
      },
    ]);
    staffFindMany.mockResolvedValue([{ id: "staff-1", displayName: "SPA 測試員" }]);

    const result = await fetchSpaLiffBookings();
    expect(result).toEqual({
      status: "ok",
      upcoming: [
        expect.objectContaining({
          id: "spa-booking-1",
          bookingDate: "2099-10-20",
          slotTime: "14:00",
          endTime: "15:30",
          bookingStatus: "CONFIRMED",
          serviceName: "臉部保濕護理",
          staffName: "SPA 測試員",
          locationName: "美容床 1",
        }),
      ],
      history: [],
    });
    expect(staffFindMany.mock.calls[0][0].where).toEqual({
      storeId: "spa-store",
      id: { in: ["staff-1"] },
    });
  });

  it("uses SpaEntitlement remainingUses, reservations and expiry consistently", async () => {
    entitlementFindMany.mockResolvedValue([
      {
        id: "entitlement-1",
        nameSnapshot: "十次臉部護理",
        totalUses: 10,
        remainingUses: 6,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        expiryDate: new Date("2099-12-31T00:00:00.000Z"),
        status: "ACTIVE",
        uses: [
          { uses: 2, status: "COMPLETED" },
          { uses: 1, status: "RESERVED" },
          { uses: 2, status: "RELEASED" },
        ],
      },
    ]);

    const result = await fetchSpaLiffEntitlements();
    expect(result).toEqual({
      status: "ok",
      active: [
        {
          id: "entitlement-1",
          planName: "十次臉部護理",
          planCategory: "PACKAGE",
          totalSessions: 10,
          remainingSessions: 6,
          availableToBook: 5,
          pendingCount: 1,
          usedCount: 4,
          voidedCount: 0,
          startDate: "2026-01-01",
          expiryDate: "2099-12-31",
          status: "ACTIVE",
        },
      ],
      expired: [],
      history: [],
      makeupCredits: [],
    });
    expect(entitlementFindMany.mock.calls[0][0].where).toEqual({
      storeId: "spa-store",
      customerId: "customer-1",
    });
  });

  it("fails closed when the signed-in user has no membership in the visible store", async () => {
    resolveMembership.mockResolvedValue(null);

    expect(await fetchSpaLiffBookings()).toEqual({ status: "no_customer" });
    expect(await fetchSpaLiffEntitlements()).toEqual({ status: "no_customer" });
    expect(bookingFindMany).not.toHaveBeenCalled();
    expect(entitlementFindMany).not.toHaveBeenCalled();
  });
});
