import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  customerFindUnique: vi.fn(),
  hasStoreFeature: vi.fn(),
  getCurrentUser: vi.fn(),
  getNativeHealthSummary: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findUnique: (...args: unknown[]) => h.customerFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/feature-gate", () => ({
  hasStoreFeature: (...args: unknown[]) => h.hasStoreFeature(...args),
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: (...args: unknown[]) => h.getCurrentUser(...args),
}));

vi.mock("@/lib/permissions", () => ({
  isOwner: () => false,
}));

vi.mock("@/lib/native-health-service", () => ({
  getNativeHealthSummary: (...args: unknown[]) => h.getNativeHealthSummary(...args),
}));

import { getHealthCardData } from "@/server/queries/health-card";

describe("customer health card feature gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.customerFindUnique.mockResolvedValue({
      storeId: "store-1",
    });
    h.getCurrentUser.mockResolvedValue({
      id: "user-1",
      role: "CUSTOMER",
      storeId: "store-1",
    });
  });

  it("does not read native health records when ai_health_summary is disabled for the store", async () => {
    h.hasStoreFeature.mockResolvedValue(false);

    await expect(getHealthCardData("customer-1")).resolves.toEqual({
      available: false,
      reason: "feature-unavailable",
    });

    expect(h.hasStoreFeature).toHaveBeenCalledWith(
      "store-1",
      "ai_health_summary",
    );
    expect(h.getNativeHealthSummary).not.toHaveBeenCalled();
  });

  it("reads the current store's native health summary when enabled", async () => {
    h.hasStoreFeature.mockResolvedValue(true);
    h.getNativeHealthSummary.mockResolvedValue({
      latest: { measuredAt: "2026-08-24", weight: 60 },
      trend: [],
      alerts: [],
      meta: { totalRecords: 1, daysSinceLastMeasure: 0, firstMeasuredAt: "2026-08-24" },
    });

    const result = await getHealthCardData("customer-1");
    expect(result.available).toBe(true);
    expect(h.getNativeHealthSummary).toHaveBeenCalledWith("customer-1", "store-1");
  });
});
