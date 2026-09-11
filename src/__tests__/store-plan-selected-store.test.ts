import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveStoreForRead: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireStaffSession: vi.fn(async () => ({ role: "OWNER", storeId: "mother" })),
}));
vi.mock("@/lib/store", () => ({
  getActiveStoreForRead: (...args: unknown[]) => mocks.getActiveStoreForRead(...args),
}));
vi.mock("@/lib/db", () => ({
  prisma: { store: { findUnique: (...args: unknown[]) => mocks.findUnique(...args) } },
}));

describe("selected concrete store plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveStoreForRead.mockResolvedValue("trial-branch");
  });

  it("uses the selected descendant plan instead of the mother plan", async () => {
    mocks.findUnique.mockResolvedValue({ plan: "EXPERIENCE" });
    const { getCurrentStorePlan } = await import("@/lib/store-plan");

    await expect(getCurrentStorePlan()).resolves.toBe("EXPERIENCE");
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: "trial-branch" },
      select: { plan: true },
    });
  });

  it("always gives the isolated SPA Demo store the full-access plan", async () => {
    mocks.getActiveStoreForRead.mockResolvedValue("demo-store");
    const { getCurrentStorePlan, getStoreForPlanByStoreId } = await import("@/lib/store-plan");

    await expect(getCurrentStorePlan()).resolves.toBe("ALLIANCE");
    await expect(getStoreForPlanByStoreId("demo-store")).resolves.toMatchObject({
      id: "demo-store",
      plan: "ALLIANCE",
    });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
