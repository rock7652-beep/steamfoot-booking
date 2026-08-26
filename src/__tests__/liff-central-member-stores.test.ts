import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  currentUser: vi.fn(),
  requireSession: vi.fn(),
  resolveMemberships: vi.fn(),
  cookieSet: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: h.currentUser,
  requireSession: h.requireSession,
}));

vi.mock("@/server/services/central-member-resolver", () => ({
  resolveCentralMembershipsForUser: h.resolveMemberships,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: h.cookieSet })),
}));

vi.mock("next/navigation", () => ({ redirect: h.redirect }));

import {
  fetchLiffMemberStoreContext,
  selectLiffMemberStoreAction,
} from "@/server/actions/liff-member-stores";

function membership(
  storeSlug: string,
  storeOperatingStatus = "ACTIVE",
) {
  return {
    userId: "user-1",
    storeId: `store-${storeSlug}`,
    storeName: `門市 ${storeSlug}`,
    storeSlug,
    storeOperatingStatus,
    customerId: `customer-${storeSlug}`,
    customerName: `會員 ${storeSlug}`,
    providers: ["line"],
  };
}

describe("LIFF central-member store context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.resolveMemberships.mockResolvedValue({ memberships: [], conflicts: [] });
  });

  it("returns no member context without a canonical customer session", async () => {
    h.currentUser.mockResolvedValue(null);

    await expect(fetchLiffMemberStoreContext()).resolves.toEqual({
      status: "not_signed_in",
    });
    expect(h.resolveMemberships).not.toHaveBeenCalled();
  });

  it("returns only active verified memberships and no customer identifiers", async () => {
    h.currentUser.mockResolvedValue({
      id: "user-1",
      role: "CUSTOMER",
      customerId: "customer-zhubei",
      storeId: "store-zhubei",
      storeSlug: "zhubei",
    });
    h.resolveMemberships.mockResolvedValue({
      memberships: [
        membership("zhubei"),
        membership("hsinchu", "TRIAL"),
        membership("closed", "INACTIVE"),
      ],
      conflicts: [],
    });

    const result = await fetchLiffMemberStoreContext();

    expect(result).toEqual({
      status: "signed_in",
      currentStoreSlug: "zhubei",
      displayName: "會員 zhubei",
      stores: [
        { storeName: "門市 zhubei", storeSlug: "zhubei" },
        { storeName: "門市 hsinchu", storeSlug: "hsinchu" },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("customer-");
    expect(JSON.stringify(result)).not.toContain("store-zhubei");
  });

  it("fails closed when the URL store is not the canonical membership", async () => {
    h.currentUser.mockResolvedValue({
      id: "user-1",
      role: "CUSTOMER",
      customerId: "customer-forged",
      storeId: "store-forged",
      storeSlug: "forged",
    });
    h.resolveMemberships.mockResolvedValue({
      memberships: [membership("zhubei")],
      conflicts: [],
    });

    await expect(fetchLiffMemberStoreContext()).resolves.toEqual({
      status: "not_signed_in",
    });
  });
});

describe("LIFF central-member store selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requireSession.mockResolvedValue({
      id: "user-1",
      role: "CUSTOMER",
      storeId: "store-zhubei",
    });
    h.resolveMemberships.mockResolvedValue({
      memberships: [membership("zhubei"), membership("hsinchu")],
      conflicts: [],
    });
  });

  it("sets the shared store cookie and redirects to a verified LIFF route", async () => {
    const formData = new FormData();
    formData.set("storeSlug", "hsinchu");

    await expect(selectLiffMemberStoreAction(formData)).rejects.toThrow(
      "REDIRECT:/s/hsinchu/liff?storeSwitched=1",
    );
    expect(h.cookieSet).toHaveBeenCalledWith(
      "store-slug",
      "hsinchu",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
  });

  it("rejects a forged slug and returns to a verified membership", async () => {
    const formData = new FormData();
    formData.set("storeSlug", "forged");

    await expect(selectLiffMemberStoreAction(formData)).rejects.toThrow(
      "REDIRECT:/s/zhubei/liff?storeSwitchError=1",
    );
    expect(h.cookieSet).not.toHaveBeenCalled();
  });
});
