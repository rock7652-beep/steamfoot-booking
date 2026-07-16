import { describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const permissionFindMany = vi.fn();

vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
}));
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    staff: { findFirst: (...args: unknown[]) => findFirst(...args) },
    staffPermission: { findMany: (...args: unknown[]) => permissionFindMany(...args) },
  },
}));

describe("staff permission reads", () => {
  it("rejects a target staff outside the authorized concrete store", async () => {
    findFirst.mockResolvedValue(null);
    const { getStaffPermissions } = await import("@/lib/permissions");

    await expect(getStaffPermissions("staff-b", "branch-a")).rejects.toThrow("員工不存在");
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "staff-b", storeId: "branch-a" },
      select: { id: true },
    });
    expect(permissionFindMany).not.toHaveBeenCalled();
  });
});
