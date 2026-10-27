import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
  customer: { id: "member", name: "測試會員", phone: "0912345678", email: null, gender: null, birthday: null, address: null },
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/session", () => ({ getCurrentUser: async () => ({ id: "user", name: "測試會員", customerId: "member", storeId: "store-silverlily" }) }));
vi.mock("@/lib/store-context", () => ({ getStoreContext: async () => ({ storeId: "store-silverlily", storeSlug: "silverlily" }) }));
vi.mock("@/lib/db", () => ({ prisma: {
  store: { findUnique: async () => ({ name: "銀百合", industryModule: "COURSE" }) },
  user: { findUnique: async () => ({ passwordHash: "present" }) },
  customer: { findUnique: async () => mocks.customer },
} }));
vi.mock("@/server/queries/customer-completion", () => ({ resolveCustomerForUser: async () => ({ customer: { id: "member", userId: null }, reason: "found_by_identity_link" }) }));
vi.mock("@/server/services/central-member-resolver", () => ({ resolveCentralMembershipsForUser: async () => ({ memberships: [], conflicts: [] }) }));
vi.mock("@/server/queries/customer-login-methods", () => ({ getCustomerLoginMethods: async () => ({ phone: { linked: true }, line: { linked: true }, google: { linked: false } }) }));
vi.mock("@/lib/customer-welcome", () => ({ customerWelcomeTitle: () => "歡迎" }));
vi.mock("@/lib/store-line-config", () => ({ getConfiguredStoreLine: () => null, storeLineIdentityProvider: () => "line" }));
vi.mock("@/components/app-link", () => ({ AppLink: ({ children }: { children: React.ReactNode }) => React.createElement("a", null, children) }));
vi.mock("@/app/(customer)/profile/profile-form", () => ({ ProfileForm: () => React.createElement("form", null, "基本資料表單") }));
vi.mock("@/app/(customer)/profile/login-methods-card", () => ({ LoginMethodsCard: () => React.createElement("div", null, "登入方式") }));

import ProfilePage from "@/app/(customer)/profile/page";

describe("persisted profile completion", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.customer.phone = "0912345678"; });

  it("leaves stale onboarding after a linked membership has complete persisted data", async () => {
    await expect(ProfilePage({ searchParams: Promise.resolve({ complete: "1" }) }))
      .rejects.toThrow("REDIRECT:/s/silverlily/my-plans");
  });

  it("returns to the original store booking once persisted data is complete", async () => {
    await expect(ProfilePage({ searchParams: Promise.resolve({ complete: "1", next: "/s/silverlily/book" }) }))
      .rejects.toThrow("REDIRECT:/s/silverlily/book");
  });

  it("does not redirect back into the completion form itself", async () => {
    await expect(ProfilePage({ searchParams: Promise.resolve({ complete: "1", next: "/s/silverlily/profile?complete=1" }) }))
      .rejects.toThrow("REDIRECT:/s/silverlily/my-plans");
  });

  it("keeps an incomplete member on the registration form", async () => {
    mocks.customer.phone = "_oauth_placeholder";
    const html = renderToStaticMarkup(await ProfilePage({ searchParams: Promise.resolve({ complete: "1" }) }));
    expect(html).toContain("首次使用請完成基本資料");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps ordinary edits available to a complete member", async () => {
    const html = renderToStaticMarkup(await ProfilePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("基本資料表單");
    expect(html).not.toContain("首次使用請完成基本資料");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
