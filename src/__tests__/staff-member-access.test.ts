import { beforeEach, describe, expect, it, vi } from "vitest";

const findLink = vi.hoisted(() => vi.fn());
const resolveMembership = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: { staffMemberLink: { findUnique: findLink } } }));
vi.mock("@/server/services/central-member-resolver", () => ({ resolveCentralMemberCustomerForStore: resolveMembership }));

import { resolveActiveStaffMemberForStore } from "@/server/services/staff-member-access";

beforeEach(() => {
  vi.resetAllMocks();
  resolveMembership.mockResolvedValue({ customerId: "customer-1", storeId: "store-1" });
  findLink.mockResolvedValue({ revokedAt: null, staff: { id: "staff-1", displayName: "小美", status: "ACTIVE", storeId: "store-1" } });
});

describe("staff member access", () => {
  it("requires the verified store membership and exact active link", async () => {
    await expect(resolveActiveStaffMemberForStore("user-1", "store-1")).resolves.toEqual({ userId: "user-1", storeId: "store-1", customerId: "customer-1", staffId: "staff-1", staffName: "小美" });
    expect(findLink).toHaveBeenCalledWith(expect.objectContaining({ where: { uq_staff_member_link_user_store: { userId: "user-1", storeId: "store-1" } } }));
  });
  it("fails closed without a verified member relationship", async () => {
    resolveMembership.mockResolvedValue(null);
    await expect(resolveActiveStaffMemberForStore("user-1", "store-1")).resolves.toBeNull();
    expect(findLink).not.toHaveBeenCalled();
  });
  it.each([
    { revokedAt: new Date(), staff: { id: "staff-1", displayName: "小美", status: "ACTIVE", storeId: "store-1" } },
    { revokedAt: null, staff: { id: "staff-1", displayName: "小美", status: "INACTIVE", storeId: "store-1" } },
    { revokedAt: null, staff: { id: "staff-1", displayName: "小美", status: "ACTIVE", storeId: "other-store" } },
  ])("rejects revoked, inactive, or cross-store links", async (link) => {
    findLink.mockResolvedValue(link);
    await expect(resolveActiveStaffMemberForStore("user-1", "store-1")).resolves.toBeNull();
  });
});
