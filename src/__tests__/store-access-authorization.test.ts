import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();
const mockHasStoreFeature = vi.fn();
const mockCookieGet = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: { store: { findMany: (...args: unknown[]) => mockFindMany(...args) } },
}));
vi.mock("@/lib/feature-gate", () => ({
  hasStoreFeature: (...args: unknown[]) => mockHasStoreFeature(...args),
}));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: (...args: unknown[]) => mockCookieGet(...args) }),
}));
vi.mock("react", () => ({ cache: <T extends (...args: never[]) => unknown>(fn: T) => fn }));

const stores = [
  { id: "hq", name: "HQ", isDefault: true, parentStoreId: null, operatingStatus: "ACTIVE", createdAt: new Date(1) },
  { id: "branch-a", name: "A", isDefault: false, parentStoreId: "hq", operatingStatus: "ACTIVE", createdAt: new Date(2) },
  { id: "branch-b", name: "B", isDefault: false, parentStoreId: "hq", operatingStatus: "ACTIVE", createdAt: new Date(3) },
  { id: "inactive", name: "Off", isDefault: false, parentStoreId: "hq", operatingStatus: "INACTIVE", createdAt: new Date(4) },
  { id: "other", name: "Other", isDefault: false, parentStoreId: null, operatingStatus: "ACTIVE", createdAt: new Date(5) },
];

function installStoreQueryMock() {
  mockFindMany.mockImplementation(({ where = {} }: { where?: Record<string, unknown> }) => {
    let rows = [...stores];
    const parent = where.parentStoreId as { in: string[] } | undefined;
    const ids = where.id as { in: string[] } | string | undefined;
    if (parent) rows = rows.filter((store) => parent.in.includes(store.parentStoreId ?? ""));
    if (typeof ids === "string") rows = rows.filter((store) => store.id === ids);
    else if (ids) rows = rows.filter((store) => ids.in.includes(store.id));
    if (where.operatingStatus) rows = rows.filter((store) => store.operatingStatus === where.operatingStatus);
    return Promise.resolve(rows);
  });
}

describe("organization store authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasStoreFeature.mockResolvedValue(true);
    installStoreQueryMock();
  });

  it("lets ADMIN access every active store and platform all", async () => {
    const { getAccessibleStoreIds, validateStoreAccess } = await import("@/lib/store");
    const user = { role: "ADMIN", storeId: null };
    await expect(getAccessibleStoreIds(user)).resolves.toEqual(["hq", "branch-a", "branch-b", "other"]);
    await expect(validateStoreAccess(user, "__all__", "read")).resolves.toBeNull();
  });

  it("lets an entitled mother OWNER access only active descendants", async () => {
    const { getAccessibleStoreIds, validateStoreAccess } = await import("@/lib/store");
    const user = { role: "OWNER", storeId: "hq" };
    await expect(getAccessibleStoreIds(user)).resolves.toEqual(["hq", "branch-a", "branch-b"]);
    await expect(validateStoreAccess(user, "branch-a", "write")).resolves.toBe("branch-a");
    await expect(validateStoreAccess(user, "other", "read")).rejects.toThrow("無權存取");
    await expect(validateStoreAccess(user, "inactive", "read")).rejects.toThrow("無權存取");
    await expect(validateStoreAccess(user, "__all__", "read")).rejects.toThrow("無權查看全部分店");
  });

  it("pins PARTNER and branch OWNER to their session store", async () => {
    const { validateStoreAccess } = await import("@/lib/store");
    await expect(validateStoreAccess({ role: "PARTNER", storeId: "branch-a" }, "branch-b", "read"))
      .rejects.toThrow("無權存取");
    await expect(validateStoreAccess({ role: "OWNER", storeId: "branch-a" }, "hq", "write"))
      .rejects.toThrow("無權存取");
  });

  it("uses the OWNER viewed cookie for both reads and writes without fallback", async () => {
    const { getActiveStoreForRead, resolveWriteStoreId } = await import("@/lib/store");
    mockCookieGet.mockImplementation((name: string) => name === "viewed-store-id" ? { value: "branch-a" } : undefined);
    const user = { role: "OWNER", storeId: "hq" };
    await expect(getActiveStoreForRead(user)).resolves.toBe("branch-a");
    await expect(resolveWriteStoreId(user)).resolves.toBe("branch-a");

    mockCookieGet.mockImplementation(() => ({ value: "other" }));
    await expect(getActiveStoreForRead(user)).rejects.toThrow("無權存取");
    await expect(resolveWriteStoreId(user)).rejects.toThrow("無權存取");
  });
});
