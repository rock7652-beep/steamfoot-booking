import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({ path: "/hq/dashboard", search: "" }));
vi.mock("next/navigation", () => ({ usePathname: () => context.path, useSearchParams: () => new URLSearchParams(context.search) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as never) }));
vi.mock("@/components/operation-guide-shell", () => ({ OperationGuideShell: ({ children }: {children: unknown}) => children, OperationGuideTrigger: () => null }));
vi.mock("@/components/feature-gate", () => ({ PlanBadge: () => null, TrialProgressBar: () => null, LockedNavItem: ({label}: {label: string}) => createElement("button", {}, label) }));
vi.mock("@/components/breadcrumb", () => ({ DashboardBreadcrumb: () => null }));
vi.mock("@/components/build-footer", () => ({ default: () => null }));
vi.mock("@/components/store-switcher", () => ({ default: () => null }));
vi.mock("@/components/store-view-mode-switcher", () => ({ StoreViewModeSwitcher: () => null }));
vi.mock("@/server/actions/store-switch", () => ({ switchActiveStore: vi.fn() }));
import DashboardShell from "@/components/dashboard-shell-with-hq-line";
import { FEATURES } from "@/lib/feature-flags";

function render(module: "steamfoot" | "course" | "spa", selected: string | null, path = "/hq/dashboard") {
  context.path = path;
  context.search = "";
  return renderToStaticMarkup(createElement(DashboardShell, {
    industryModule: module, industryModuleId: module, isOwner: true,
    permissions: [], pricingPlan: "ALLIANCE", userName: "HQ", roleLabel: "總部",
    storeOptions: [{id: "a", name: "店 A", isDefault: true}], activeStoreId: selected,
    effectiveFeatures: Object.fromEntries(Object.values(FEATURES).map(key => [key, true])),
    logoutButton: null,
  }, createElement("p", {}, "page")));
}

describe("actual HQ shell rendering", () => {
  it.each(["steamfoot", "course", "spa"] as const)("retains a store navigation and HQ return for %s", module => {
    const html = render(module, "a");
    expect(html).toContain('aria-label="店舖功能導覽"');
    expect(html).toContain('aria-label="返回 HQ 總部"');
    expect(html).toContain('href="/hq/dashboard/frontend-preview"');
    expect(html).toContain(module === "course" ? 'href="/hq/dashboard/courses?view=settings"' : 'href="/hq/dashboard/settings"');
    expect(html).toContain("店舖後台");
    expect(html).not.toContain("體驗申請");
    expect(html).toContain("hidden md:flex");
  });
  it.each(["/hq/dashboard/stores", "/hq/dashboard/stores/a/features", "/hq/dashboard/stores/subscriptions", "/hq/dashboard/trial-applications"])("retains global links on %s while a course store is selected", path => {
    const html = render("course", "a", path);
    expect(html).toContain('aria-label="HQ 功能導覽"');
    expect(html).toContain("體驗申請");
    expect(html).toContain("訂閱管理");
    expect(html).toContain("LINE 官方帳號管理");
    expect(html).not.toContain("課表排程");
    expect(html).not.toContain('aria-label="返回 HQ 總部"');
  });
  it("shows grouped headquarters navigation for all stores", () => {
    const html = render("steamfoot", null);
    expect(html).toContain("品牌總覽");
    expect(html).not.toContain("HQ 首頁");
    expect(html).toContain("店舖清單");
    expect(html).not.toContain("營運與財務");
    expect(html).not.toContain("顧客經營");
    expect(html).not.toContain("預約開放設定");
    expect(html).not.toContain("值班排班設定");
    expect(html).toContain("系統工具");
    expect(html).not.toContain('href="/hq/dashboard/ranking"');
    expect(html).not.toContain('href="/hq/dashboard/analytics"');
  });
});
