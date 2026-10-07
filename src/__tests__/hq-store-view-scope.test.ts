import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("react", () => ({ cache: <T>(fn: T): T => fn }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findMany: mocks.findMany } } }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
  isOwner: (role: string) => role === "ADMIN",
  isNonOwnerStaff: (role: string) => ["OWNER", "MANAGER", "STAFF", "PARTNER"].includes(role),
}));

import {
  getEffectiveActorRole,
  getHqStoreViewContext,
  registerHqStoreViewContext,
} from "@/lib/hq-store-view-context";
import { assertStoreAccess, getStoreFilter } from "@/lib/manager-visibility";
import { ALL_STORES_ID, validateStoreAccess, currentStoreId } from "@/lib/store";

function admin() {
  return { id: "hq-user", role: "ADMIN" as const, staffId: null, storeId: null, loginRecordId: "hq-login" };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([
    { id: "store-a", slug: "a", name: "A", isDefault: false },
    { id: "store-b", slug: "b", name: "B", isDefault: false },
  ]);
});

describe("verified HQ store-view context", () => {
  it("preserves the authenticated object and its real audit identity", () => {
    const actor = admin();
    const original = { ...actor };
    expect(registerHqStoreViewContext(actor, "store-a")).toBe(actor);
    expect(actor).toEqual(original);
    expect(getEffectiveActorRole(actor)).toBe("OWNER");
    expect(getHqStoreViewContext(actor)).toEqual({ storeId: "store-a" });
    expect(Object.isFrozen(getHqStoreViewContext(actor))).toBe(true);
  });

  it("keeps different sessions of the same ADMIN independent", () => {
    const first = registerHqStoreViewContext(admin(), "store-a");
    const second = registerHqStoreViewContext(admin(), "store-b");
    const platform = admin();
    expect(getStoreFilter(first)).toEqual({ storeId: "store-a" });
    expect(getStoreFilter(second)).toEqual({ storeId: "store-b" });
    expect(getStoreFilter(platform)).toEqual({});
    expect(getEffectiveActorRole(platform)).toBe("ADMIN");
  });

  it("does not trust serialized or client-invented view fields", () => {
    const actor = registerHqStoreViewContext(admin(), "store-a");
    const unverified = { ...actor, hqStoreView: { storeId: "store-b" } };
    expect(getHqStoreViewContext(unverified)).toBeUndefined();
    expect(getEffectiveActorRole(unverified)).toBe("ADMIN");
  });

  it.each(["", ALL_STORES_ID])("rejects non-concrete registration %s", storeId => {
    expect(() => registerHqStoreViewContext(admin(), storeId)).toThrow("concrete store");
  });

  it("does not change ordinary store-role capabilities", () => {
    const actor = { role: "MANAGER" as const, staffId: "manager", storeId: "store-a" };
    expect(getEffectiveActorRole(actor)).toBe("MANAGER");
    expect(getStoreFilter(actor)).toEqual({ storeId: "store-a" });
    expect(() => assertStoreAccess(actor, "store-b")).toThrow();
  });
});

describe("HQ store-view record scope", () => {
  it("narrows omitted and null read filters to the selected store", () => {
    const actor = registerHqStoreViewContext(admin(), "store-a");
    expect(getStoreFilter(actor)).toEqual({ storeId: "store-a" });
    expect(getStoreFilter(actor, null)).toEqual({ storeId: "store-a" });
    expect(getStoreFilter(actor, "store-a")).toEqual({ storeId: "store-a" });
  });

  it.each(["store-b", ALL_STORES_ID])("rejects an explicit read scope of %s", storeId => {
    const actor = registerHqStoreViewContext(admin(), "store-a");
    expect(() => getStoreFilter(actor, storeId)).toThrow("無權存取其他店舖");
  });

  it("allows own-store record access and blocks a different store's record ID", () => {
    const actor = registerHqStoreViewContext(admin(), "store-a");
    expect(() => assertStoreAccess(actor, "store-a")).not.toThrow();
    expect(() => assertStoreAccess(actor, "store-b")).toThrow("無權存取其他店舖");
  });

  it("retains platform ADMIN access outside store-view mode", () => {
    const actor = admin();
    expect(getStoreFilter(actor)).toEqual({});
    expect(getStoreFilter(actor, "store-b")).toEqual({ storeId: "store-b" });
    expect(() => assertStoreAccess(actor, "store-b")).not.toThrow();
  });
});

describe("HQ store-view store resolver", () => {
  it.each(["read", "write"] as const)("rejects other-store and all-store %s before queries", async mode => {
    const actor = registerHqStoreViewContext(admin(), "store-a");
    await expect(validateStoreAccess(actor, "store-b", mode)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(validateStoreAccess(actor, ALL_STORES_ID, mode)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it.each(["read", "write"] as const)("allows selected-store %s while rechecking availability", async mode => {
    const actor = registerHqStoreViewContext(admin(), "store-a");
    await expect(validateStoreAccess(actor, "store-a", mode)).resolves.toBe("store-a");
    expect(mocks.findMany).toHaveBeenCalled();
    mocks.findMany.mockResolvedValue([]);
    await expect(validateStoreAccess(actor, "store-a", mode)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("retains authorized switching to another store or HQ", async () => {
    const actor = registerHqStoreViewContext(admin(), "store-a");
    await expect(validateStoreAccess(actor, "store-b", "switch")).resolves.toBe("store-b");
    await expect(validateStoreAccess(actor, ALL_STORES_ID, "switch")).resolves.toBeNull();
  });
});

it("resolves writes from verified selection instead of missing or stale ADMIN store identity", () => {
  expect(currentStoreId(registerHqStoreViewContext(admin(), "store-a"))).toBe("store-a");
  expect(currentStoreId(registerHqStoreViewContext({...admin(),storeId:"store-b"}, "store-a"))).toBe("store-a");
});
