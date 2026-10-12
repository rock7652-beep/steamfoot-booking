import { createElement as h, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ user: vi.fn(), permission: vi.fn(), storeId: vi.fn(), industry: vi.fn(), view: vi.fn(), feature: vi.fn(), panel: vi.fn(), workspace: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.user }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.storeId }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: m.industry }));
vi.mock("@/lib/store-view-context-server", () => ({ resolveStoreViewContextFromCookie: m.view }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: m.feature }));
vi.mock("@/server/queries/usage", () => ({ getStoreUsage: async () => ({ metrics: [] }) }));
vi.mock("@/server/queries/course-setup", () => ({ getCourseSetup: async () => ({}) }));
vi.mock("@/components/admin/course-setup-guide", () => ({ CourseSetupGuide: () => null }));
vi.mock("@/components/desktop", () => ({ PageShell: ({ children }: { children: ReactNode }) => h("main", null, children), PageHeader: () => null }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: async () => ({ name: "虛構店", plan: "EXPERIENCE", subscriptions: [] }) }, shopConfig: { findUnique: async () => null }, storeFeatureEntitlement: { findFirst: async () => null } } }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { courseBookingRule: { findUnique: async () => null }, courseWaitlistSetting: { findUnique: async () => null } } }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: () => { throw new Error("REDIRECT"); } }));
vi.mock("@/app/(dashboard)/dashboard/courses/settings-workspace", () => ({ CourseSettingsWorkspace: m.workspace }));
vi.mock("@/app/(dashboard)/dashboard/courses/settings-panel-content", () => ({ CourseSettingsPanelContent: m.panel }));

import { CourseSharedHub } from "@/app/(dashboard)/dashboard/courses/shared-hub";
import type { CourseSettingsWorkspace } from "@/app/(dashboard)/dashboard/courses/settings-workspace";
import { FEATURES } from "@/lib/feature-flags";

beforeEach(() => {
  vi.resetAllMocks();
  m.user.mockResolvedValue({ id: "owner-a", role: "OWNER", staffId: "owner-staff" });
  m.permission.mockResolvedValue(true);
  m.storeId.mockResolvedValue("store-a");
  m.industry.mockResolvedValue("course");
  m.view.mockResolvedValue({ isViewMode: false });
  m.feature.mockResolvedValue(false);
  m.workspace.mockImplementation((props: ComponentProps<typeof CourseSettingsWorkspace>) => h("div", null, props.panelContent));
  m.panel.mockReturnValue(null);
});
async function render(panel?: string) {
  renderToStaticMarkup(await CourseSharedHub({ view: "settings", panel, panelQuery: "tab=customer" }));
  return m.workspace.mock.calls.at(-1)![0] as ComponentProps<typeof CourseSettingsWorkspace>;
}
const entries = [
  { panel: "reminders", feature: FEATURES.LINE_REMINDER, prop: "canReminders", permission: "business_hours.manage" },
  { panel: "referral", feature: FEATURES.REFERRAL_SHARE, prop: "canReferralShare", permission: "plans.edit" },
  { panel: "butler", feature: FEATURES.DIGITAL_BUTLER, prop: "canDigitalButler", permission: "plans.edit" },
] as const;
describe("course settings server permission and feature boundaries", () => {
  it.each(["OWNER", "PARTNER", "ADMIN"])("retains %s destination permissions for disabled features so the provider can show locked entries", async role => {
    m.user.mockResolvedValue({ id: "actor-a", role, staffId: "staff-a" });
    const props = await render();
    for (const entry of entries) expect(props[entry.prop]).toBe(true);
    expect(m.panel).toHaveBeenCalledOnce();
  });
  it.each(entries)("does not render direct $panel server content for a disabled feature", async entry => {
    const props = await render(entry.panel);
    expect(props[entry.prop]).toBe(true);
    expect(props.panelContent).toBeNull();
    expect(m.panel).not.toHaveBeenCalled();
    expect(m.feature).toHaveBeenCalledWith("store-a", entry.feature);
  });
  it.each(entries)("renders enabled $panel content only with the original permission", async entry => {
    m.feature.mockImplementation(async (_store, feature) => feature === entry.feature);
    let props = await render(entry.panel);
    expect(props[entry.prop]).toBe(true);
    expect(m.panel).toHaveBeenCalledOnce();
    m.panel.mockClear();
    m.permission.mockImplementation(async (_role, _staff, permission) => permission !== entry.permission);
    props = await render(entry.panel);
    expect(props[entry.prop]).toBe(false);
    expect(props.panelContent).toBeNull();
    expect(m.panel).not.toHaveBeenCalled();
  });
  it.each(entries)("retains read-only restrictions for $panel even with an enabled feature", async entry => {
    m.feature.mockResolvedValue(true);
    m.view.mockResolvedValue({ isViewMode: true });
    const props = await render(entry.panel);
    expect(props[entry.prop]).toBe(false);
    expect(props.panelContent).toBeNull();
    expect(m.panel).not.toHaveBeenCalled();
  });
  it.each(["MANAGER", "STAFF", "CUSTOMER"])("keeps the existing %s settings-page role restriction", async role => {
    m.user.mockResolvedValue({ id: "actor-a", role, staffId: "staff-a" });
    await expect(render("butler")).rejects.toThrow("NOT_FOUND");
    expect(m.feature).not.toHaveBeenCalled();
  });
  it("uses the current store for direct panel checks after changing stores", async () => {
    m.feature.mockImplementation(async storeId => storeId === "store-a");
    await render("butler");
    expect(m.panel).toHaveBeenCalledOnce();
    m.panel.mockClear();
    m.storeId.mockResolvedValue("store-b");
    const props = await render("butler");
    expect(props.storeId).toBe("store-b");
    expect(props.panelContent).toBeNull();
    expect(m.panel).not.toHaveBeenCalled();
  });
});
