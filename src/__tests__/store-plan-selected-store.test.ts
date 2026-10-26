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

  it("reads the stored plan for a former Demo store without a full-access shortcut", async () => {
    mocks.getActiveStoreForRead.mockResolvedValue("demo-store");
    mocks.findUnique.mockResolvedValue({id:"demo-store",plan:"BASIC"});
    const { getCurrentStorePlan, getStoreForPlanByStoreId } = await import("@/lib/store-plan");
    await expect(getCurrentStorePlan()).resolves.toBe("BASIC");
    await expect(getStoreForPlanByStoreId("demo-store")).resolves.toMatchObject({id:"demo-store",plan:"BASIC"});
    expect(mocks.findUnique).toHaveBeenCalledTimes(2);
    expect(mocks.findUnique.mock.calls.every(([args])=>args.where.id==="demo-store")).toBe(true);
  });
});
