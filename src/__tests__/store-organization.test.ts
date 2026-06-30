import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();
const mockPermissionFindMany = vi.fn();
const mockRequireStaffSession = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    store: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    staffPermission: {
      findMany: (...args: unknown[]) => mockPermissionFindMany(...args),
    },
  },
}));

vi.mock("react", () => ({
  cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));

vi.mock("@/lib/session", () => ({
  requireStaffSession: (...args: unknown[]) => mockRequireStaffSession(...args),
}));

function mockStoreTree(parentToChildren: Record<string, string[]>) {
  mockFindMany.mockImplementation(({ where }: { where: { parentStoreId: { in: string[] } } }) => {
    const parentIds = where.parentStoreId.in;
    const rows = parentIds.flatMap((parentId) =>
      (parentToChildren[parentId] ?? []).map((id) => ({
        id,
        parentStoreId: parentId,
      })),
    );
    return Promise.resolve(rows);
  });
}

describe("store organization foundation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissionFindMany.mockResolvedValue([{ permission: "customer.create" }]);
  });

  it("allows viewing own store without querying descendants", async () => {
    const { canViewStore } = await import("@/lib/store-organization");

    await expect(canViewStore("store-a", "store-a")).resolves.toBe(true);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("allows viewing descendant stores", async () => {
    const { canViewStore, getDescendantStoreIds } = await import("@/lib/store-organization");
    mockStoreTree({
      "store-a": ["store-b"],
      "store-b": ["store-c"],
    });

    await expect(getDescendantStoreIds("store-a")).resolves.toEqual(["store-b", "store-c"]);
    await expect(canViewStore("store-a", "store-c")).resolves.toBe(true);
  });

  it("rejects sibling store viewing", async () => {
    const { canViewStore } = await import("@/lib/store-organization");
    mockStoreTree({
      root: ["store-a", "store-b"],
      "store-a": [],
    });

    await expect(canViewStore("store-a", "store-b")).resolves.toBe(false);
  });

  it("rejects reverse parent viewing", async () => {
    const { canViewStore } = await import("@/lib/store-organization");
    mockStoreTree({
      parent: ["child"],
      child: [],
    });

    await expect(canViewStore("child", "parent")).resolves.toBe(false);
  });

  it("rejects self-parent assignment", async () => {
    const { assertValidStoreParentAssignment } = await import("@/lib/store-organization");

    await expect(
      assertValidStoreParentAssignment("store-a", "store-a"),
    ).rejects.toThrow("店舖不可將自己設為上層店舖");
  });

  it("rejects parent assignment that would create a cycle", async () => {
    const { assertValidStoreParentAssignment } = await import("@/lib/store-organization");
    mockStoreTree({
      "store-a": ["store-b"],
      "store-b": ["store-c"],
    });

    await expect(
      assertValidStoreParentAssignment("store-a", "store-c"),
    ).rejects.toThrow("店舖組織不可形成循環關係");
  });

  it("denies writable guard when a staff user is in descendant view mode", async () => {
    const { requireWritablePermission } = await import("@/lib/permissions");
    mockRequireStaffSession.mockResolvedValue({
      id: "user-a",
      role: "OWNER",
      staffId: "staff-a",
      storeId: "store-a",
    });
    mockStoreTree({
      "store-a": ["store-b"],
    });

    await expect(
      requireWritablePermission("customer.create", { viewedStoreId: "store-b" }),
    ).rejects.toThrow("查看模式下不可執行操作");
  });
});
