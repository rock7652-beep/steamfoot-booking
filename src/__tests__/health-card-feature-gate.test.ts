import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  customerFindUnique: vi.fn(),
  hasStoreFeature: vi.fn(),
  getCurrentUser: vi.fn(),
  getHealthSummarySafe: vi.fn(),
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

vi.mock("@/lib/health-service", () => ({
  getHealthSummarySafe: (...args: unknown[]) => h.getHealthSummarySafe(...args),
}));

import { getHealthCardData } from "@/server/queries/health-card";

describe("customer health card feature gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.customerFindUnique.mockResolvedValue({
      storeId: "store-1",
      healthProfileId: "profile-1",
      healthLinkStatus: "linked",
    });
    h.getCurrentUser.mockResolvedValue({
      id: "user-1",
      role: "CUSTOMER",
      storeId: "store-1",
    });
  });

  it("does not call HealthFlow when ai_health_summary is disabled for the store", async () => {
    h.hasStoreFeature.mockResolvedValue(false);

    await expect(getHealthCardData("customer-1")).resolves.toEqual({
      available: false,
      reason: "feature-unavailable",
    });

    expect(h.hasStoreFeature).toHaveBeenCalledWith(
      "store-1",
      "ai_health_summary",
    );
    expect(h.getHealthSummarySafe).not.toHaveBeenCalled();
  });
});
