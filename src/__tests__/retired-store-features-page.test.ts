import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ store: vi.fn(), user: vi.fn(), permission: vi.fn(), feature: vi.fn(), sharedCard: vi.fn(), evidence: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: mocks.store } } }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/server/services/hq-addons-release-evidence", () => ({readHqBeautyAddOnsReleaseEvidence:mocks.evidence}));
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
  mocks.user.mockResolvedValue({id:"hq",role:"ADMIN"});
  mocks.permission.mockResolvedValue(true);
  mocks.feature.mockResolvedValue(false);
  mocks.sharedCard.mockResolvedValue(null);
  mocks.evidence.mockResolvedValue({status:"UNAVAILABLE"});
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
  expect(mocks.evidence).not.toHaveBeenCalled();
});

it("retains the HQ permission boundary before accessing historical settings", async () => {
  mocks.permission.mockResolvedValue(false);
  await expect(StoreFeatureSettingsPage({ params: Promise.resolve({ storeId: "archived-spa" }) })).rejects.toThrow("redirect:/hq/login");
  expect(mocks.store).not.toHaveBeenCalled();
});

function currentStore(industryModule="BEAUTY") {
  mocks.store.mockResolvedValue({id:"current",name:"驗收店",slug:"current",industryModule,plan:"EXPERIENCE",featureEntitlements:[],digitalButlerEnabled:false});
}

it("ordinary HQ reads do not run release diagnostics or add visible controls",async()=>{
 currentStore();
 const html=renderToStaticMarkup(await StoreFeatureSettingsPage({params:Promise.resolve({storeId:"current"})}));
 expect(mocks.evidence).not.toHaveBeenCalled();expect(html).not.toContain("beauty-addons-release-evidence");
});

it("the opt-in Beauty HQ page exposes only the server evidence JSON",async()=>{
 currentStore();
 const html=renderToStaticMarkup(await StoreFeatureSettingsPage({params:Promise.resolve({storeId:"current"}),searchParams:Promise.resolve({releaseEvidence:"1"})}));
 expect(mocks.evidence).toHaveBeenCalledOnce();expect(html).toContain('id="beauty-addons-release-evidence" type="application/json"');
 expect(html).toContain('{"status":"UNAVAILABLE"}');
});

it("does not interpret duplicated query parameters as permission to run diagnostics",async()=>{
 currentStore();
 await StoreFeatureSettingsPage({params:Promise.resolve({storeId:"current"}),searchParams:Promise.resolve({releaseEvidence:["1","1"]})});
 expect(mocks.evidence).not.toHaveBeenCalled();
});

it("leaves other modules outside the Beauty runtime check",async()=>{
 currentStore("COURSE");
 await StoreFeatureSettingsPage({params:Promise.resolve({storeId:"current"}),searchParams:Promise.resolve({releaseEvidence:"1"})});
 expect(mocks.evidence).not.toHaveBeenCalled();
});

it("rejects a store owner using the opt-in HQ URL before loading any store",async()=>{
 mocks.user.mockResolvedValue({id:"owner",role:"OWNER"});
 await expect(StoreFeatureSettingsPage({params:Promise.resolve({storeId:"current"}),searchParams:Promise.resolve({releaseEvidence:"1"})})).rejects.toThrow("redirect:/hq/login");
 expect(mocks.store).not.toHaveBeenCalled();expect(mocks.evidence).not.toHaveBeenCalled();
});
