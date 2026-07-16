import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  getActiveStoreForRead: vi.fn(),
  validateStoreAccess: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    staff: {
      findMany: (...args: unknown[]) => mocks.findMany(...args),
      findFirst: (...args: unknown[]) => mocks.findFirst(...args),
    },
  },
}));
vi.mock("@/lib/session", () => ({
  requireStaffSession: vi.fn(async () => ({ role: "OWNER", storeId: "mother" })),
}));
vi.mock("@/lib/permissions", () => ({
  requirePermission: vi.fn(async () => ({ role: "OWNER", storeId: "mother" })),
}));
vi.mock("@/lib/store", () => ({
  getActiveStoreForRead: (...args: unknown[]) => mocks.getActiveStoreForRead(...args),
  validateStoreAccess: (...args: unknown[]) => mocks.validateStoreAccess(...args),
}));

describe("staff concrete-store reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveStoreForRead.mockResolvedValue("branch-a");
    mocks.findMany.mockResolvedValue([]);
    mocks.findFirst.mockResolvedValue(null);
  });

  it("lists staff only from the route-authorized store", async () => {
    const { listStaff } = await import("@/server/queries/staff");
    await listStaff("branch-a");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "branch-a" },
    }));
  });

  it("does not accept a mismatched requested store", async () => {
    const { listStaff } = await import("@/server/queries/staff");
    mocks.validateStoreAccess.mockResolvedValue("branch-b");
    await expect(listStaff("branch-b")).rejects.toThrow("店舖與查詢店舖不一致");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("scopes staff detail ownership by id and storeId", async () => {
    const { getStaffDetail } = await import("@/server/queries/staff");
    await expect(getStaffDetail("foreign-staff", "branch-a")).rejects.toThrow("員工不存在");
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "foreign-staff", storeId: "branch-a" },
    }));
  });
});
