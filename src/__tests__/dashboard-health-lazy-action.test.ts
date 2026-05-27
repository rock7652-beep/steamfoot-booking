/**
 * fetchHealthSummaryForDashboard — server action unit tests
 *
 * Coverage（per audit §7.5 + §6 風險表）：
 *   - forbidden when requirePermission throws
 *   - forbidden when customer not found
 *   - forbidden when assertStoreAccess throws (cross-store)
 *   - no_profile when healthProfileId is null
 *   - no_profile when healthLinkStatus is "unlinked"
 *   - not_found when healthLinkStatus is "not_found"
 *   - error when healthLinkStatus is "error"
 *   - service_unavailable when getHealthSummarySafe returns null
 *   - ok with summary when linked + API ok
 *   - does NOT call tryAutoLinkHealth (no DB write)
 *   - does NOT leak healthProfileId in result
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequirePermission = vi.fn();
const mockAssertStoreAccess = vi.fn();
const mockCustomerFindUnique = vi.fn();
const mockGetHealthSummarySafe = vi.fn();

function throwIfCalled(name: string) {
  return vi.fn(() => {
    throw new Error(`[guard] unexpected ${name}() — must NOT be called`);
  });
}

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findUnique: (...a: unknown[]) => mockCustomerFindUnique(...a),
      update: throwIfCalled("customer.update"),
      create: throwIfCalled("customer.create"),
      delete: throwIfCalled("customer.delete"),
    },
    transaction: { create: throwIfCalled("transaction.create") },
    booking: { update: throwIfCalled("booking.update") },
  },
}));

vi.mock("@/lib/permissions", () => ({
  requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
}));

vi.mock("@/lib/manager-visibility", () => ({
  assertStoreAccess: (...a: unknown[]) => mockAssertStoreAccess(...a),
}));

vi.mock("@/lib/health-service", () => ({
  getHealthSummarySafe: (...a: unknown[]) => mockGetHealthSummarySafe(...a),
  lookupHealthProfileSafe: throwIfCalled("lookupHealthProfileSafe"),
  invalidateHealthCache: throwIfCalled("invalidateHealthCache"),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { fetchHealthSummaryForDashboard } from "@/server/actions/health";

const STORE_A = "store-zhubei";
const STORE_B = "store-other";
const CUSTOMER_A = "cust-aaa";
const PROFILE_A = "00000000-1111-2222-3333-444444444444";

function ownerInStoreA() {
  return { id: "u-1", role: "OWNER", staffId: null, storeId: STORE_A };
}

const FAKE_SUMMARY = {
  latest: {
    measuredAt: "2026-05-25T10:00:00Z",
    weight: 65,
    bmi: 22,
    bodyFat: 24,
    muscleMass: 30,
    boneMass: 3,
    visceralFat: 5,
    bmr: 1400,
    bodyWater: 55,
    metabolicAge: 30,
    note: null,
  },
  trend: [],
  alerts: [],
  meta: { totalRecords: 1, daysSinceLastMeasure: 2, firstMeasuredAt: "2026-05-23" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermission.mockResolvedValue(ownerInStoreA());
  mockAssertStoreAccess.mockReturnValue(undefined);
  mockCustomerFindUnique.mockResolvedValue({
    id: CUSTOMER_A,
    storeId: STORE_A,
    healthProfileId: PROFILE_A,
    healthLinkStatus: "linked",
  });
  mockGetHealthSummarySafe.mockResolvedValue(FAKE_SUMMARY);
});

describe("fetchHealthSummaryForDashboard", () => {
  it("returns forbidden when requirePermission throws", async () => {
    mockRequirePermission.mockRejectedValueOnce(new Error("no perm"));
    const r = await fetchHealthSummaryForDashboard(CUSTOMER_A);
    expect(r).toEqual({ status: "forbidden" });
    expect(mockGetHealthSummarySafe).not.toHaveBeenCalled();
  });

  it("returns forbidden when customer not found", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(null);
    const r = await fetchHealthSummaryForDashboard(CUSTOMER_A);
    expect(r).toEqual({ status: "forbidden" });
    expect(mockGetHealthSummarySafe).not.toHaveBeenCalled();
  });

  it("returns forbidden when assertStoreAccess throws (cross-store)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_A,
      storeId: STORE_B, // different store
      healthProfileId: PROFILE_A,
      healthLinkStatus: "linked",
    });
    mockAssertStoreAccess.mockImplementationOnce(() => {
      throw new Error("FORBIDDEN");
    });
    const r = await fetchHealthSummaryForDashboard(CUSTOMER_A);
    expect(r).toEqual({ status: "forbidden" });
    expect(mockGetHealthSummarySafe).not.toHaveBeenCalled();
  });

  it("returns no_profile when healthProfileId is null", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_A,
      storeId: STORE_A,
      healthProfileId: null,
      healthLinkStatus: "unlinked",
    });
    const r = await fetchHealthSummaryForDashboard(CUSTOMER_A);
    expect(r).toEqual({ status: "no_profile" });
    expect(mockGetHealthSummarySafe).not.toHaveBeenCalled();
  });

  it("returns no_profile when healthLinkStatus is unlinked (even with stale profileId)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_A,
      storeId: STORE_A,
      healthProfileId: PROFILE_A, // stale; status is the truth
      healthLinkStatus: "unlinked",
    });
    const r = await fetchHealthSummaryForDashboard(CUSTOMER_A);
    expect(r).toEqual({ status: "no_profile" });
    expect(mockGetHealthSummarySafe).not.toHaveBeenCalled();
  });

  it("returns not_found when healthLinkStatus is not_found", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_A,
      storeId: STORE_A,
      healthProfileId: null,
      healthLinkStatus: "not_found",
    });
    const r = await fetchHealthSummaryForDashboard(CUSTOMER_A);
    expect(r).toEqual({ status: "not_found" });
    expect(mockGetHealthSummarySafe).not.toHaveBeenCalled();
  });

  it("returns error when healthLinkStatus is error", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_A,
      storeId: STORE_A,
      healthProfileId: null,
      healthLinkStatus: "error",
    });
    const r = await fetchHealthSummaryForDashboard(CUSTOMER_A);
    expect(r).toEqual({ status: "error" });
    expect(mockGetHealthSummarySafe).not.toHaveBeenCalled();
  });

  it("returns service_unavailable when getHealthSummarySafe returns null", async () => {
    mockGetHealthSummarySafe.mockResolvedValueOnce(null);
    const r = await fetchHealthSummaryForDashboard(CUSTOMER_A);
    expect(r).toEqual({ status: "service_unavailable" });
    // 確實有試打 API（只是 safeApi 回 null）
    expect(mockGetHealthSummarySafe).toHaveBeenCalledTimes(1);
  });

  it("returns ok with summary when linked + API ok", async () => {
    const r = await fetchHealthSummaryForDashboard(CUSTOMER_A);
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.summary).toBe(FAKE_SUMMARY);
    }
    expect(mockGetHealthSummarySafe).toHaveBeenCalledTimes(1);
  });

  it("passes profileId + context to getHealthSummarySafe", async () => {
    await fetchHealthSummaryForDashboard(CUSTOMER_A);
    expect(mockGetHealthSummarySafe).toHaveBeenCalledWith(PROFILE_A, {
      customerId: CUSTOMER_A,
      storeId: STORE_A,
    });
  });

  it("does NOT leak healthProfileId in any result variant", async () => {
    const variants = [
      { healthProfileId: null, healthLinkStatus: "unlinked" },
      { healthProfileId: null, healthLinkStatus: "not_found" },
      { healthProfileId: null, healthLinkStatus: "error" },
      { healthProfileId: PROFILE_A, healthLinkStatus: "linked" },
    ];
    for (const variant of variants) {
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: CUSTOMER_A,
        storeId: STORE_A,
        ...variant,
      });
      const r = await fetchHealthSummaryForDashboard(CUSTOMER_A);
      const json = JSON.stringify(r);
      expect(json.includes(PROFILE_A)).toBe(false);
    }
  });

  it("does NOT call any prisma write method (purely read-only)", async () => {
    // beforeEach has installed throwIfCalled guards on customer.update/create/delete,
    // transaction.create, booking.update. If the action accidentally writes,
    // those throws would propagate.
    await fetchHealthSummaryForDashboard(CUSTOMER_A);
    // No assertion needed beyond completion without throw — guards are the assertion.
  });
});
