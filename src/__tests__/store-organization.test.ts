import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();
const mockPermissionFindMany = vi.fn();
const mockRequireStaffSession = vi.fn();
const mockCookieGet = vi.fn();
const mockCookieSet = vi.fn();
const mockCookieDelete = vi.fn();
const mockRevalidatePath = vi.fn();
const mockHasStoreFeature = vi.fn();
const mockRequireStoreFeature = vi.fn();

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
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (...args: unknown[]) => mockCookieGet(...args),
      set: (...args: unknown[]) => mockCookieSet(...args),
      delete: (...args: unknown[]) => mockCookieDelete(...args),
    }),
}));

vi.mock("@/lib/session", () => ({
  requireStaffSession: (...args: unknown[]) => mockRequireStaffSession(...args),
}));

vi.mock("@/lib/feature-gate", () => ({
  hasStoreFeature: (...args: unknown[]) => mockHasStoreFeature(...args),
  requireStoreFeature: (...args: unknown[]) => mockRequireStoreFeature(...args),
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
    mockCookieGet.mockReturnValue(undefined);
    mockHasStoreFeature.mockResolvedValue(true);
    mockRequireStoreFeature.mockResolvedValue(undefined);
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

  it("does not expose descendant stores when multi_store is disabled", async () => {
    const { getViewableStoreOptions } = await import("@/lib/store-organization");
    mockHasStoreFeature.mockResolvedValueOnce(false);
    mockFindMany.mockImplementation(({ where }: { where: { id?: { in: string[] } } }) => {
      if (where.id?.in) {
        return Promise.resolve([
          { id: "store-a", name: "A", createdAt: new Date("2026-01-01T00:00:00Z") },
        ]);
      }
      throw new Error("descendant query should not run");
    });

    await expect(getViewableStoreOptions("store-a")).resolves.toEqual([
      { id: "store-a", name: "A", isOwnStore: true },
    ]);
    expect(mockHasStoreFeature).toHaveBeenCalledWith("store-a", "multi_store");
  });

  it("rejects descendant store viewing when multi_store is disabled", async () => {
    const { canViewStore } = await import("@/lib/store-organization");
    mockHasStoreFeature.mockResolvedValueOnce(false);

    await expect(canViewStore("store-a", "store-b")).resolves.toBe(false);
    expect(mockFindMany).not.toHaveBeenCalled();
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

  it("denies writable guard from viewed-store cookie when no explicit options are passed", async () => {
    const { requireWritablePermission } = await import("@/lib/permissions");
    mockRequireStaffSession.mockResolvedValue({
      id: "user-a",
      role: "OWNER",
      staffId: "staff-a",
      storeId: "store-a",
    });
    mockCookieGet.mockImplementation((name: string) =>
      name === "viewed-store-id" ? { value: "store-b" } : undefined,
    );
    mockStoreTree({
      "store-a": ["store-b"],
    });

    await expect(requireWritablePermission("customer.create")).rejects.toThrow(
      "查看模式下不可執行操作",
    );
  });

  it("resolves view context fields for own store and descendant view mode", async () => {
    const { resolveStoreViewContext } = await import("@/lib/store-organization");
    mockStoreTree({
      "store-a": ["store-b"],
    });
    const user = {
      id: "user-a",
      role: "OWNER",
      storeId: "store-a",
    };

    await expect(resolveStoreViewContext(user)).resolves.toEqual({
      ownStoreId: "store-a",
      viewedStoreId: "store-a",
      isViewMode: false,
      canWrite: true,
    });
    await expect(
      resolveStoreViewContext(user, { viewedStoreId: "store-b" }),
    ).resolves.toEqual({
      ownStoreId: "store-a",
      viewedStoreId: "store-b",
      isViewMode: true,
      canWrite: false,
    });
  });

  it("sets viewed-store cookie only for descendant stores", async () => {
    const { switchViewedStore } = await import("@/server/actions/store-view-mode");
    mockRequireStaffSession.mockResolvedValue({
      id: "user-a",
      role: "OWNER",
      staffId: "staff-a",
      storeId: "store-a",
    });
    mockStoreTree({
      "store-a": ["store-b"],
    });

    await expect(switchViewedStore("store-b")).resolves.toEqual({
      success: true,
      data: undefined,
    });
    expect(mockCookieSet).toHaveBeenCalledWith(
      "viewed-store-id",
      "store-b",
      expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("does not set viewed-store cookie when multi_store is disabled", async () => {
    const { switchViewedStore } = await import("@/server/actions/store-view-mode");
    mockRequireStaffSession.mockResolvedValue({
      id: "user-a",
      role: "OWNER",
      staffId: "staff-a",
      storeId: "store-a",
    });
    mockRequireStoreFeature.mockRejectedValueOnce(new Error("feature disabled"));

    const result = await switchViewedStore("store-b");

    expect(result.success).toBe(false);
    expect(mockRequireStoreFeature).toHaveBeenCalledWith("store-a", "multi_store");
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("clears viewed-store cookie when returning to own store", async () => {
    const { switchViewedStore } = await import("@/server/actions/store-view-mode");
    mockRequireStaffSession.mockResolvedValue({
      id: "user-a",
      role: "OWNER",
      staffId: "staff-a",
      storeId: "store-a",
    });

    await expect(switchViewedStore("__own__")).resolves.toEqual({
      success: true,
      data: undefined,
    });
    expect(mockCookieDelete).toHaveBeenCalledWith("viewed-store-id");
  });

  it("rejects switching view mode to a sibling store", async () => {
    const { switchViewedStore } = await import("@/server/actions/store-view-mode");
    mockRequireStaffSession.mockResolvedValue({
      id: "user-a",
      role: "OWNER",
      staffId: "staff-a",
      storeId: "store-a",
    });
    mockStoreTree({
      root: ["store-a", "store-b"],
      "store-a": [],
    });

    const result = await switchViewedStore("store-b");
    expect(result.success).toBe(false);
    expect(mockCookieSet).not.toHaveBeenCalled();
  });
});
