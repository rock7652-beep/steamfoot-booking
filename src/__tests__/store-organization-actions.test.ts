import { beforeEach, describe, expect, it, vi } from "vitest";

const mockStoreFindMany = vi.fn();
const mockStoreFindUnique = vi.fn();
const mockStoreUpdate = vi.fn();
const mockAuditLogCreate = vi.fn();
const mockTransaction = vi.fn();
const mockRequireAdminSession = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    store: {
      findMany: (...args: unknown[]) => mockStoreFindMany(...args),
      findUnique: (...args: unknown[]) => mockStoreFindUnique(...args),
      update: (...args: unknown[]) => mockStoreUpdate(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => mockAuditLogCreate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/session", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

describe("store organization actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminSession.mockResolvedValue({ id: "admin-user", role: "ADMIN" });
    mockStoreFindMany.mockResolvedValue([]);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        store: { update: mockStoreUpdate },
        auditLog: { create: mockAuditLogCreate },
      }),
    );
  });

  it("lists stores with parentStoreId for HQ organization UI", async () => {
    const { listStoreOrganizationAction } = await import("@/server/actions/store-organization");
    const rows = [
      {
        id: "store-a",
        name: "A",
        slug: "a",
        parentStoreId: null,
        isDemo: false,
        operatingStatus: "ACTIVE",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];
    mockStoreFindMany.mockResolvedValue(rows);

    const result = await listStoreOrganizationAction();

    expect(mockRequireAdminSession).toHaveBeenCalled();
    expect(mockStoreFindMany).toHaveBeenCalledWith({
      select: {
        id: true,
        name: true,
        slug: true,
        parentStoreId: true,
        isDemo: true,
        operatingStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    expect(result).toEqual({ success: true, data: rows });
  });

  it("rejects self-parent updates before mutating", async () => {
    const { updateStoreParentAction } = await import("@/server/actions/store-organization");

    const result = await updateStoreParentAction({
      storeId: "store-a",
      parentStoreId: "store-a",
    });

    expect(result.success).toBe(false);
    expect(mockStoreUpdate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it("rejects cycle updates before mutating", async () => {
    const { updateStoreParentAction } = await import("@/server/actions/store-organization");
    mockStoreFindUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === "store-a") {
        return Promise.resolve({ id: "store-a", name: "A", parentStoreId: null });
      }
      if (where.id === "store-c") {
        return Promise.resolve({ id: "store-c", name: "C" });
      }
      return Promise.resolve(null);
    });
    mockStoreFindMany.mockImplementation(({ where }: { where: { parentStoreId: { in: string[] } } }) => {
      const ids = where.parentStoreId.in;
      if (ids.includes("store-a")) return Promise.resolve([{ id: "store-b", parentStoreId: "store-a" }]);
      if (ids.includes("store-b")) return Promise.resolve([{ id: "store-c", parentStoreId: "store-b" }]);
      return Promise.resolve([]);
    });

    const result = await updateStoreParentAction({
      storeId: "store-a",
      parentStoreId: "store-c",
    });

    expect(result.success).toBe(false);
    expect(mockStoreUpdate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it("updates parentStoreId and writes AuditLog", async () => {
    const { updateStoreParentAction } = await import("@/server/actions/store-organization");
    mockStoreFindUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === "store-b") {
        return Promise.resolve({ id: "store-b", name: "B", parentStoreId: null });
      }
      if (where.id === "store-a") {
        return Promise.resolve({ id: "store-a", name: "A" });
      }
      return Promise.resolve(null);
    });

    const result = await updateStoreParentAction({
      storeId: "store-b",
      parentStoreId: "store-a",
    });

    expect(result).toEqual({
      success: true,
      data: { storeId: "store-b", parentStoreId: "store-a" },
    });
    expect(mockStoreUpdate).toHaveBeenCalledWith({
      where: { id: "store-b" },
      data: { parentStoreId: "store-a" },
    });
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: {
        actorUserId: "admin-user",
        targetType: "Store",
        targetId: "store-b",
        action: "UPDATE_ORGANIZATION_PARENT",
        beforeJson: { parentStoreId: null },
        afterJson: { parentStoreId: "store-a", parentStoreName: "A" },
      },
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/hq/dashboard/stores");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/hq/dashboard/stores/organization");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/hq/dashboard/stores/store-b");
  });
});
