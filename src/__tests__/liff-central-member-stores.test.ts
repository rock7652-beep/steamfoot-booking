import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LiffStoreSwitcher } from "@/app/(liff)/liff/liff-store-switcher";

const h = vi.hoisted(() => ({
  findStores: vi.fn(),
  currentUser: vi.fn(),
  requireSession: vi.fn(),
  resolveMemberships: vi.fn(),
  cookieSet: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/db", () => ({ prisma: { store: { findMany: h.findStores } } }));

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
    h.findStores.mockResolvedValue([{ id: "store-zhubei" }, { id: "store-hsinchu" }]);
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
        membership("archived"),
        membership("archived-trial", "TRIAL"),
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
    expect(h.findStores).toHaveBeenCalledWith({
      where: { id: { in: ["store-zhubei", "store-hsinchu", "store-archived", "store-archived-trial"] }, archivedAt: null },
      select: { id: true },
    });
    expect(JSON.stringify(result)).not.toContain("customer-");
    expect(JSON.stringify(result)).not.toContain("store-zhubei");
  });

  it("keeps an existing archived-store session but hides it from selection", async () => {
    h.currentUser.mockResolvedValue({
      id: "user-1", role: "CUSTOMER", customerId: "customer-archived",
      storeId: "store-archived", storeSlug: "archived",
    });
    h.resolveMemberships.mockResolvedValue({
      memberships: [membership("archived"), membership("zhubei")], conflicts: [],
    });
    await expect(fetchLiffMemberStoreContext()).resolves.toEqual({
      status: "signed_in", currentStoreSlug: "archived", displayName: "會員 archived",
      stores: [{ storeName: "門市 zhubei", storeSlug: "zhubei" }],
    });
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
    h.findStores.mockResolvedValue([{ id: "store-zhubei" }, { id: "store-hsinchu" }]);
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

  it("rejects a submitted archived store even when its membership is active", async () => {
    h.resolveMemberships.mockResolvedValue({
      memberships: [membership("zhubei"), membership("archived")], conflicts: [],
    });
    const formData = new FormData();
    formData.set("storeSlug", "archived");
    await expect(selectLiffMemberStoreAction(formData)).rejects.toThrow(
      "REDIRECT:/s/zhubei/liff?storeSwitchError=1",
    );
    expect(h.cookieSet).not.toHaveBeenCalled();
  });

  it("falls back to a visible store when the current store has been archived", async () => {
    h.findStores.mockResolvedValue([{ id: "store-hsinchu" }]);
    const formData = new FormData();
    formData.set("storeSlug", "zhubei");
    await expect(selectLiffMemberStoreAction(formData)).rejects.toThrow(
      "REDIRECT:/s/hsinchu/liff?storeSwitchError=1",
    );
    expect(h.cookieSet).not.toHaveBeenCalled();
  });

  it("returns home when all memberships are archived", async () => {
    h.findStores.mockResolvedValue([]);
    const formData = new FormData();
    formData.set("storeSlug", "zhubei");
    await expect(selectLiffMemberStoreAction(formData)).rejects.toThrow("REDIRECT:/");
    expect(h.redirect).toHaveBeenCalledWith("/");
    expect(h.cookieSet).not.toHaveBeenCalled();
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


describe("LIFF switcher after store archiving", () => {
  it("allows leaving an archived store when only one visible store remains", () => {
    const html = renderToStaticMarkup(createElement(LiffStoreSwitcher, {
      currentStoreSlug: "archived", currentStoreName: "封存門市",
      stores: [{ storeSlug: "active", storeName: "營運門市" }],
    }));
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain("切換門市");
  });

  it.each([{ stores: [] }, { stores: [{ storeSlug: "active", storeName: "營運門市" }] }])(
    "shows only the current name when there is no other selectable store: %j",
    ({ stores }) => {
      const html = renderToStaticMarkup(createElement(LiffStoreSwitcher, {
        currentStoreSlug: "active", currentStoreName: "營運門市", stores,
      }));
      expect(html).toContain("營運門市");
      expect(html).not.toContain('aria-haspopup="menu"');
    },
  );
});
