import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  grantFindFirst: vi.fn(),
  localSummary: vi.fn(),
  crossStoreSummary: vi.fn(),
  resolveOwner: vi.fn(),
  resolveMemberships: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    customerHealthHistoryGrant: {
      findFirst: (...args: unknown[]) => h.grantFindFirst(...args),
    },
  },
}));
vi.mock("@/lib/native-health-service", () => ({
  getNativeHealthSummary: (...args: unknown[]) => h.localSummary(...args),
  getNativeHealthSummaryForMemberships: (...args: unknown[]) =>
    h.crossStoreSummary(...args),
}));
vi.mock("@/server/services/resolve-central-user-for-store-customer", () => ({
  resolveCentralUserForStoreCustomer: (...args: unknown[]) => h.resolveOwner(...args),
}));
vi.mock("@/server/services/central-member-resolver", () => ({
  resolveCentralMembershipsForUser: (...args: unknown[]) => h.resolveMemberships(...args),
}));

import { getStaffVisibleHealthSummary } from "@/server/services/customer-health-history-grant";

describe("staff-visible customer health history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.localSummary.mockResolvedValue({ latest: { weight: 60 } });
    h.crossStoreSummary.mockResolvedValue({ latest: { weight: 61 } });
    h.resolveOwner.mockResolvedValue({
      status: "resolved",
      user: { id: "user-1" },
    });
    h.resolveMemberships.mockResolvedValue({ memberships: [], conflicts: [] });
  });

  it("uses only the target store when no active customer consent exists", async () => {
    h.grantFindFirst.mockResolvedValue(null);

    const result = await getStaffVisibleHealthSummary({
      targetStoreId: "store-b",
      targetCustomerId: "customer-b",
    });

    expect(result.hasCrossStoreGrant).toBe(false);
    expect(h.localSummary).toHaveBeenCalledWith("customer-b", "store-b");
    expect(h.resolveMemberships).not.toHaveBeenCalled();
    expect(h.crossStoreSummary).not.toHaveBeenCalled();
  });

  it("fails closed when the target membership is no longer verified", async () => {
    h.grantFindFirst.mockResolvedValue({ id: "grant-1" });
    h.resolveMemberships.mockResolvedValue({
      memberships: [
        {
          storeId: "store-a",
          customerId: "customer-a",
          storeName: "A",
          storeSlug: "a",
        },
        {
          storeId: "store-b",
          customerId: "different-customer",
          storeName: "B",
          storeSlug: "b",
        },
      ],
      conflicts: [],
    });

    const result = await getStaffVisibleHealthSummary({
      targetStoreId: "store-b",
      targetCustomerId: "customer-b",
    });

    expect(result.hasCrossStoreGrant).toBe(false);
    expect(h.localSummary).toHaveBeenCalledWith("customer-b", "store-b");
    expect(h.crossStoreSummary).not.toHaveBeenCalled();
  });

  it("uses exact verified memberships only after active consent", async () => {
    h.grantFindFirst.mockResolvedValue({ id: "grant-1" });
    const memberships = [
      {
        storeId: "store-a",
        customerId: "customer-a",
        storeName: "A",
        storeSlug: "a",
      },
      {
        storeId: "store-b",
        customerId: "customer-b",
        storeName: "B",
        storeSlug: "b",
      },
    ];
    h.resolveMemberships.mockResolvedValue({ memberships, conflicts: [] });

    const result = await getStaffVisibleHealthSummary({
      targetStoreId: "store-b",
      targetCustomerId: "customer-b",
    });

    expect(result).toEqual({
      summary: { latest: { weight: 61 } },
      hasCrossStoreGrant: true,
      storeCount: 2,
    });
    expect(h.crossStoreSummary).toHaveBeenCalledWith(memberships);
    expect(h.localSummary).not.toHaveBeenCalled();
  });
});
