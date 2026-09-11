import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieValue: null as string | null,
  findMany: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: vi.fn((name: string) =>
      name === "active-store-id" && mocks.cookieValue ? { value: mocks.cookieValue } : undefined,
    ),
  })),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    store: { findMany: mocks.findMany },
  },
}));

vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: vi.fn(async () => false) }));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));

import {
  ALL_STORES_ID,
  getActiveStoreForRead,
  resolveWriteStoreId,
  validateStoreAccess,
} from "@/lib/store";

describe("settings active-store authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieValue = null;
    mocks.findMany.mockResolvedValue([{
      id: "branch-a", slug: "branch-a", name: "Branch A", parentStoreId: null, isDefault: true,
    }]);
  });

  it("ADMIN reads and writes the same validated active store", async () => {
    mocks.cookieValue = "branch-a";
    const user = { role: "ADMIN", storeId: null };

    await expect(getActiveStoreForRead(user)).resolves.toBe("branch-a");
    await expect(resolveWriteStoreId(user)).resolves.toBe("branch-a");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { operatingStatus: { in: ["ACTIVE", "TRIAL"] } },
    }));
  });

  it("allows all stores only for aggregate reads and rejects mutation", async () => {
    const user = { role: "ADMIN", storeId: null };
    await expect(validateStoreAccess(user, ALL_STORES_ID, "read")).resolves.toBeNull();
    await expect(validateStoreAccess(user, ALL_STORES_ID, "write")).rejects.toThrow(
      "請先在上方切換到指定分店",
    );
  });

  it("does not fall back when the cookie store does not exist", async () => {
    mocks.cookieValue = "missing-store";
    mocks.findMany.mockResolvedValue([]);

    await expect(
      resolveWriteStoreId({ role: "ADMIN", storeId: null }),
    ).rejects.toThrow("店舖不存在、已停用或無權存取");
  });

  it("pins non-ADMIN staff to the session store and rejects another store", async () => {
    const owner = { role: "OWNER", storeId: "branch-a" };
    mocks.cookieValue = "branch-b";

    await expect(getActiveStoreForRead(owner)).resolves.toBe("branch-a");
    await expect(resolveWriteStoreId(owner)).resolves.toBe("branch-a");
    await expect(validateStoreAccess(owner, "branch-b", "write")).rejects.toThrow(
      "店舖不存在、已停用或無權存取",
    );
  });
});
