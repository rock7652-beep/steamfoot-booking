import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requireSession: vi.fn(),
  canonicalCustomerId: vi.fn(),
  customerFindUnique: vi.fn(),
  requireStoreFeature: vi.fn(),
  resolveMemberships: vi.fn(),
  getSummary: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireSession: (...args: unknown[]) => h.requireSession(...args),
}));

vi.mock("@/lib/customer-identity", () => ({
  getCanonicalCustomerIdForSession: (...args: unknown[]) =>
    h.canonicalCustomerId(...args),
  getCanonicalCustomerForSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findUnique: (...args: unknown[]) => h.customerFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/feature-gate", () => ({
  requireStoreFeature: (...args: unknown[]) => h.requireStoreFeature(...args),
}));

vi.mock("@/server/services/central-member-resolver", () => ({
  resolveCentralMembershipsForUser: (...args: unknown[]) =>
    h.resolveMemberships(...args),
}));

vi.mock("@/lib/native-health-service", () => ({
  getNativeHealthSummaryForMemberships: (...args: unknown[]) =>
    h.getSummary(...args),
}));

import { fetchLiffHealthSummary } from "@/server/actions/liff-health";

const emptySummary = {
  latest: null,
  trend: [],
  alerts: [],
  meta: { totalRecords: 0, daysSinceLastMeasure: null, firstMeasuredAt: null },
};

describe("LIFF central-member health summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requireSession.mockResolvedValue({ id: "user-1", role: "CUSTOMER" });
    h.canonicalCustomerId.mockResolvedValue("customer-current");
    h.customerFindUnique.mockResolvedValue({
      id: "customer-current",
      storeId: "store-current",
    });
    h.requireStoreFeature.mockResolvedValue(undefined);
    h.resolveMemberships.mockResolvedValue({
      memberships: [
        {
          storeId: "store-current",
          customerId: "customer-current",
          storeName: "暖沐蒸足",
          storeSlug: "nuanmu",
        },
        {
          storeId: "store-other",
          customerId: "customer-other",
          storeName: "暖暖蒸足",
          storeSlug: "zhubei",
        },
      ],
      conflicts: [],
    });
    h.getSummary.mockResolvedValue(emptySummary);
  });

  it("reads only verified store/customer pairs and returns the verified store count", async () => {
    await expect(fetchLiffHealthSummary()).resolves.toEqual({
      status: "ok",
      linked: true,
      summary: emptySummary,
      verifiedStoreCount: 2,
    });

    expect(h.resolveMemberships).toHaveBeenCalledWith("user-1");
    expect(h.getSummary).toHaveBeenCalledWith([
      {
        storeId: "store-current",
        customerId: "customer-current",
        storeName: "暖沐蒸足",
        storeSlug: "nuanmu",
      },
      {
        storeId: "store-other",
        customerId: "customer-other",
        storeName: "暖暖蒸足",
        storeSlug: "zhubei",
      },
    ]);
  });

  it("fails closed when the current LIFF customer is not verified centrally", async () => {
    h.resolveMemberships.mockResolvedValueOnce({
      memberships: [
        {
          storeId: "store-other",
          customerId: "customer-other",
          storeName: "暖暖蒸足",
          storeSlug: "zhubei",
        },
      ],
      conflicts: [],
    });

    await expect(fetchLiffHealthSummary()).resolves.toEqual({
      status: "no_customer",
    });
    expect(h.getSummary).not.toHaveBeenCalled();
  });
});
