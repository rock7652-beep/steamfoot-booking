import { describe, expect, it, vi } from "vitest";
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
const grants = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: { staffPermission: { findMany: grants } } }));
import { ALL_PERMISSIONS, checkPermission, getUserPermissions, getDefaultPermissionsForRole, isStaffRole, isOwner } from "@/lib/permissions";
import { canManageStaffRole, canAssignStaffRole, assertStoreRetainsOwner } from "@/lib/staff-role-policy";
import type { Prisma } from "@prisma/client";

describe("Owner / Manager / Staff presets", () => {
  it("Owner has store permissions except headquarters-only audit reads", async () => {
    grants.mockResolvedValue([]);
    for (const code of ALL_PERMISSIONS) expect(await checkPermission("OWNER", "owner", code)).toBe(code !== "audit.read");
    expect(await getUserPermissions("OWNER", "owner")).toEqual(ALL_PERMISSIONS.filter(code => code !== "audit.read"));
    expect(isOwner("OWNER")).toBe(false); // legacy helper means global Admin
    expect(await checkPermission("OWNER", null, "inventory.read")).toBe(false);
  });
  it.each(["MANAGER", "STAFF"] as const)("%s excludes cost and purchase payment by default", role => {
    const defaults = getDefaultPermissionsForRole(role);
    expect(defaults).toEqual(expect.arrayContaining(["inventory.read", "inventory.write", "inventory.receive"]));
    expect(defaults).not.toContain("inventory.cost.read"); expect(defaults).not.toContain("inventory.purchase.pay");
    expect(defaults.includes("staff.manage")).toBe(role === "MANAGER");
  });
  it("Staff and legacy Partner retain explicit grants; defaults never silently grant runtime access", async () => {
    grants.mockResolvedValue([{ permission: "inventory.read" }]);
    for (const role of ["STAFF", "PARTNER", "MANAGER"] as const) {
      expect(isStaffRole(role)).toBe(true); expect(await checkPermission(role, "staff", "inventory.read")).toBe(true);
      expect(await checkPermission(role, "staff", "inventory.cost.read")).toBe(false);
    }
    expect(await checkPermission("CUSTOMER", "staff", "inventory.read")).toBe(false);
  });
  it("Manager manages only staff and cannot assign higher roles", () => {
    for (const role of ["OWNER", "MANAGER", "ADMIN", "CUSTOMER"] as const) expect(canManageStaffRole("MANAGER", role)).toBe(false);
    expect(canManageStaffRole("MANAGER", "STAFF")).toBe(true); expect(canManageStaffRole("MANAGER", "PARTNER")).toBe(true);
    expect(canAssignStaffRole("MANAGER", "OWNER")).toBe(false); expect(canAssignStaffRole("MANAGER", "MANAGER")).toBe(false);
    expect(canAssignStaffRole("MANAGER", "STAFF")).toBe(true);
  });
  it("checks remaining active Owners under the store lock, independently of global Admin", async () => {
    const raw = vi.fn(), count = vi.fn().mockResolvedValue(0);
    const tx = { $queryRaw: raw, staff: { findFirst: vi.fn().mockResolvedValue({ id: "last-owner" }), count } } as unknown as Prisma.TransactionClient;
    await expect(assertStoreRetainsOwner(tx, "store-a", "last-owner")).rejects.toThrow("至少須保留一位");
    expect(raw).toHaveBeenCalled(); expect(count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store-a", user: { role: "OWNER", status: "ACTIVE" } }) }));
    count.mockResolvedValue(1); await expect(assertStoreRetainsOwner(tx, "store-a", "last-owner")).resolves.toBeUndefined();
  });
});

it.each(["OWNER", "MANAGER", "STAFF", "PARTNER"] as const)("%s login resolves to its own store, not the member front end", async role => {
  const { resolveLoginRedirect } = await import("@/server/auth/resolve-login-redirect");
  expect(resolveLoginRedirect({ userRole: role, entry: "hq", userStoreSlug: "store-a" })).toMatchObject({ redirectTo: "/s/store-a/admin/dashboard", error: null });
  expect(resolveLoginRedirect({ userRole: role, entry: "store-admin", targetStoreSlug: "store-b", userStoreSlug: "store-a" })).toMatchObject({ redirectTo: "/s/store-a/admin/dashboard", setStoreSlug: "store-a" });
});

it.each(["OWNER", "MANAGER", "PARTNER", "STAFF", "CUSTOMER"] as const)("%s cannot read audit even with a saved grant", async role => {
  grants.mockResolvedValue([{ permission: "audit.read" }, { permission: "booking.read" }]);
  expect(await checkPermission(role, "legacy-audit", "audit.read")).toBe(false);
  expect(await getUserPermissions(role, "legacy-audit")).not.toContain("audit.read");
  expect(getDefaultPermissionsForRole(role)).not.toContain("audit.read");
});
it("retains headquarters audit access", async () => {
  expect(await checkPermission("ADMIN", null, "audit.read")).toBe(true);
  expect(await getUserPermissions("ADMIN", null)).toContain("audit.read");
});
