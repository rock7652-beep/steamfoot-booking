import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieValue: null as string | null,
  findUnique: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() =>
      mocks.cookieValue ? { value: mocks.cookieValue } : undefined,
    ),
  })),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    store: { findUnique: mocks.findUnique },
  },
}));

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
    mocks.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
    }));
  });

  it("ADMIN reads and writes the same validated active store", async () => {
    mocks.cookieValue = "branch-a";
    const user = { role: "ADMIN", storeId: null };

    await expect(getActiveStoreForRead(user)).resolves.toBe("branch-a");
    await expect(resolveWriteStoreId(user)).resolves.toBe("branch-a");
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: "branch-a" },
      select: { id: true },
    });
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
    mocks.findUnique.mockResolvedValue(null);

    await expect(
      resolveWriteStoreId({ role: "ADMIN", storeId: null }),
    ).rejects.toThrow("店舖不存在或已無法存取");
  });

  it("pins non-ADMIN staff to the session store and rejects another store", async () => {
    const owner = { role: "OWNER", storeId: "branch-a" };
    mocks.cookieValue = "branch-b";

    await expect(getActiveStoreForRead(owner)).resolves.toBe("branch-a");
    await expect(resolveWriteStoreId(owner)).resolves.toBe("branch-a");
    await expect(validateStoreAccess(owner, "branch-b", "write")).rejects.toThrow(
      "無權操作此店舖",
    );
  });
});
