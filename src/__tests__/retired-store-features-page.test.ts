import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ store: vi.fn(), permission: vi.fn(), feature: vi.fn(), sharedCard: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: mocks.store } } }));
vi.mock("@/lib/session", () => ({ getCurrentUser: async () => ({ id: "hq", role: "ADMIN" }) }));
vi.mock("@/lib/permissions", () => ({ checkPermission: mocks.permission }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: mocks.feature }));
vi.mock("@/server/services/course-shared-card", () => ({ readCourseSharedCardSnapshot: mocks.sharedCard }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: "a" }));
vi.mock("@/app/hq/dashboard/stores/[storeId]/features/feature-entitlement-list", () => ({ FeatureEntitlementList: "form" }));
vi.mock("@/app/hq/dashboard/stores/[storeId]/features/digital-butler-activation-form", () => ({ DigitalButlerActivationForm: "form" }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); }, notFound: () => { throw new Error("not-found"); } }));
import StoreFeatureSettingsPage from "@/app/hq/dashboard/stores/[storeId]/features/page";

beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("React", React);
  mocks.permission.mockResolvedValue(true);
  mocks.store.mockResolvedValue({ id: "archived-spa", industryModule: "SPA" });
});
afterEach(() => vi.unstubAllGlobals());

it("renders the retired setting notice before any entitlement readers or editors", async () => {
  const html = renderToStaticMarkup(await StoreFeatureSettingsPage({ params: Promise.resolve({ storeId: "archived-spa" }) }));
  expect(html).toContain("此模組已停用");
  expect(html).toContain("/hq/dashboard/operation-audits?module=SPA");
  expect(html).not.toMatch(/<(?:form|input|select|button)\b/);
  expect(mocks.feature).not.toHaveBeenCalled();
  expect(mocks.sharedCard).not.toHaveBeenCalled();
});

it("retains the HQ permission boundary before accessing historical settings", async () => {
  mocks.permission.mockResolvedValue(false);
  await expect(StoreFeatureSettingsPage({ params: Promise.resolve({ storeId: "archived-spa" }) })).rejects.toThrow("redirect:/hq/login");
  expect(mocks.store).not.toHaveBeenCalled();
});
