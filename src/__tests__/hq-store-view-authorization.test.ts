import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ selected: "store-a" as string | undefined, path: "/hq/dashboard", blocked: false }));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-next-pathname": state.path }),
  cookies: async () => ({ get: (key: string) => key === "active-store-id" && state.selected ? { value: state.selected } : undefined }),
}));
const feature = vi.hoisted(() => vi.fn());
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: feature }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
const actor = { id: "hq-user", role: "ADMIN" as const, staffId: null, storeId: null };
vi.mock("@/lib/session", () => ({ requireStaffSession: async () => actor }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: async () => { if (state.path === "stale-route") throw new Error("stale route"); return state.selected ?? null; }, validateStoreAccess: async (_user: unknown, id: string) => { if (id !== "store-a") throw new Error("foreign scope"); return id; } }));
const subscription = vi.hoisted(() => vi.fn());
vi.mock("@/lib/subscription-guard", () => ({ assertStoreSubscriptionWritable: subscription }));
import { checkPermission, getUserPermissions, requirePermission, DEFAULT_OWNER_PERMISSIONS } from "@/lib/permissions";
import { getEffectiveStoreRole, isHqStoreView } from "@/lib/hq-store-view";

describe("HQ store-view capability boundary", () => {
  beforeEach(() => { state.selected = "store-a"; state.path = "/hq/dashboard"; subscription.mockReset(); feature.mockReset(); });
  it("uses store-owner capabilities without changing the authenticated actor", async () => {
    expect(await getEffectiveStoreRole(actor)).toBe("OWNER");
    expect(await getUserPermissions("ADMIN", null)).toEqual(DEFAULT_OWNER_PERMISSIONS);
    expect(await checkPermission("ADMIN", null, "audit.read")).toBe(false);
    expect(await requirePermission("customer.read")).toBe(actor);
    expect(actor.role).toBe("ADMIN");
  });
  it("denies direct audit actions and enforces the selected store subscription", async () => {
    await expect(requirePermission("audit.read")).rejects.toThrow("您沒有此操作");
    subscription.mockRejectedValue(new Error("expired"));
    await expect(requirePermission("booking.create")).rejects.toThrow("expired");
    expect(subscription).toHaveBeenCalledWith("store-a");
  });
  it("does not regain headquarters privileges through a pathname or missing action headers", async () => {
    for (const path of ["/hq/dashboard/stores", "/api/data-export", ""]) {
      state.path = path;
      expect(await checkPermission("ADMIN", null, "audit.read")).toBe(false);
    }
  });
  it("restores HQ permissions only after returning to all stores", async () => {
    state.selected = "__all__";
    expect(await isHqStoreView(actor)).toBe(false);
    expect(await checkPermission("ADMIN", null, "audit.read")).toBe(true);
    await requirePermission("booking.create");
    expect(subscription).not.toHaveBeenCalled();
  });
  it("never changes ordinary store staff or customer roles", async () => {
    expect(await getEffectiveStoreRole({ role: "STAFF" })).toBe("STAFF");
    expect(await getEffectiveStoreRole({ role: "CUSTOMER" })).toBe("CUSTOMER");
  });
});

it.each(["booking.create", "customer.update", "wallet.create"] as const)("rejects hidden/locked core feature for %s before writing", async permission => {
  state.selected = "store-a";
  feature.mockRejectedValue(new Error("feature locked"));
  await expect(requirePermission(permission)).rejects.toThrow("feature locked");
  expect(subscription).not.toHaveBeenCalled();
});

it("gates a validated explicit drawer store without resolving stale unused route scope", async () => {
  state.selected="store-a"; state.path="stale-route"; feature.mockReset();
  await expect(requirePermission("booking.read", undefined, {storeId:"store-a"})).resolves.toBe(actor);
  expect(feature).toHaveBeenCalledWith("store-a","basic_booking");
  feature.mockClear();
  await expect(requirePermission("booking.read", undefined, {storeId:"store-b"})).rejects.toThrow("foreign scope");
  expect(feature).not.toHaveBeenCalled();
});
