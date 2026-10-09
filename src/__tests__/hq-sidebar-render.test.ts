import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({ path: "/hq/dashboard", search: "" }));
vi.mock("next/navigation", () => ({ usePathname: () => context.path, useSearchParams: () => new URLSearchParams(context.search) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as never) }));
vi.mock("@/components/operation-guide-shell", () => ({ OperationGuideShell: ({ children, enabled, contextPath }: {children: unknown; enabled: boolean; contextPath: string}) => createElement("div", {"data-guide-enabled": String(enabled), "data-guide-path": contextPath}, children as never), OperationGuideTrigger: () => null }));
vi.mock("@/components/feature-gate", () => ({ PlanBadge: () => null, TrialProgressBar: () => null, LockedNavItem: ({label}: {label: string}) => createElement("button", {}, label) }));
vi.mock("@/components/breadcrumb", () => ({ DashboardBreadcrumb: () => null }));
vi.mock("@/components/build-footer", () => ({ default: () => null }));
vi.mock("@/components/store-switcher", () => ({ default: () => null }));
vi.mock("@/components/store-view-mode-switcher", () => ({ StoreViewModeSwitcher: () => null }));
vi.mock("@/server/actions/store-switch", () => ({ switchActiveStore: vi.fn() }));
import DashboardShell from "@/components/dashboard-shell-with-hq-line";
import { FEATURES } from "@/lib/feature-flags";
import { ALL_PERMISSIONS } from "@/lib/permissions";

function render(module: "steamfoot" | "course" | "spa", selected: string | null, path = "/hq/dashboard", musicEnabled = false, isOwner = true, permissions: string[] = isOwner ? [...ALL_PERMISSIONS] : [], hiddenInventory = false, canOpenCourseSettings = isOwner, auditGranted = false) {
  context.path = path;
  context.search = "";
  return renderToStaticMarkup(createElement(DashboardShell, {
    industryModule: module, industryModuleId: module, musicEnabled, isOwner,
    canOpenCourseSettings,
    canViewAudit: auditGranted || (path.startsWith("/hq") && !selected),
    operationGuidePreview: true,
    cashDrawerStoreId: selected && permissions.includes("cashDrawer.read") ? selected : undefined,
    permissions, pricingPlan: "ALLIANCE", userName: "HQ", roleLabel: "總部",
    storeOptions: [{id: "a", name: "店 A", isDefault: true}], activeStoreId: selected,
    effectiveFeatures: Object.fromEntries(Object.values(FEATURES).map(key => [key, true])),
    featureStates: hiddenInventory ? { [FEATURES.INVENTORY]: "HIDDEN" } : {},
    logoutButton: null,
  }, createElement("p", {}, "page")));
}

describe("actual HQ shell rendering", () => {
  it("hides course settings from staff despite legacy owner-level navigation and booking access", () => {
    const html = render("course", "a", "/s/store-a/admin/dashboard", false, true, ["booking.read"], false, false);
    expect(html).toContain('href="/s/store-a/admin/dashboard/courses"');
    expect(html).not.toContain('href="/s/store-a/admin/dashboard/courses?view=settings"');
  });
  it("retains course settings for eligible store managers with booking access", () => {
    const html = render("course", "a", "/s/store-a/admin/dashboard", false, true, ["booking.read"], false, true);
    expect(html).toContain('href="/s/store-a/admin/dashboard/courses?view=settings"');
  });
  it("hides course settings when an eligible role lacks its required booking access", () => {
    const html = render("course", "a", "/s/store-a/admin/dashboard", false, true, [], false, true);
    expect(html).not.toContain('href="/s/store-a/admin/dashboard/courses?view=settings"');
  });
  it.each([["steamfoot", false], ["spa", false], ["course", false], ["course", true]] as const)("puts cash first in the %s header (music=%s)", (module, music) => {
    const html = render(module, "a", "/hq/dashboard", music);
    expect(html.indexOf("現金抽屜")).toBeGreaterThan(0);
    expect(html.indexOf("現金抽屜")).toBeLessThan(html.indexOf('aria-label="預覽工具"'));
    expect(render(module, null)).not.toContain("現金抽屜");
  });
  it.each(["steamfoot", "spa", "course"] as const)("keeps the store guide available when HQ enters %s", module => {
    const html = render(module, "a", "/hq/dashboard/bookings");
    expect(html).toContain('data-guide-enabled="true"');
    expect(html).toContain('data-guide-path="/dashboard/bookings"');
    const noPermission = render(module, "a", "/s/store-a/admin/dashboard", false, false, []);
    expect(noPermission).toContain('data-guide-enabled="false"');
  });
  it("moves HQ preview tools into the header without duplicate sidebar entries", () => {
    const html = render("steamfoot", null);
    expect(html).toContain('aria-label="預覽工具"');
    expect(html).not.toContain('href="/hq/dashboard/frontend-preview"');
    expect(html).not.toContain('href="/hq/dashboard/device-preview"');
    expect(html).toContain('data-guide-enabled="false"');
  });
  it.each([["steamfoot", false], ["spa", false], ["course", false], ["course", true]] as const)("uses the same two open sections for %s (music=%s)", (module, music) => {
    const html = render(module, "a", "/s/store-a/admin/dashboard", music);
    expect(html).toContain("日常工作"); expect(html).toContain("店務管理");
    expect(html).not.toContain("店務設定");
    expect(html.indexOf("顧客經營")).toBeLessThan(html.indexOf("進銷存"));
    expect(html.indexOf("進銷存")).toBeLessThan(html.indexOf("營運</span>"));
    expect(html.indexOf("方案管理")).toBeLessThan(html.indexOf("人員管理"));
    expect(html).not.toContain("數位管家名單</span>");
    expect(html).toContain('aria-label="預覽工具"');
  });
  it.each([["steamfoot", false], ["spa", false], ["course", false], ["course", true]] as const)("removes hidden HQ store entries for %s (music=%s)", (module, music) => {
    const html = render(module, "a", "/hq/dashboard", music, true, [...ALL_PERMISSIONS], true);
    expect(html).not.toContain("進銷存");
    expect(html).not.toContain('href="/hq/dashboard/inventory"');
    expect(html).toContain('href="/hq/dashboard/staff"');
    expect(render(module, "a", "/hq/dashboard", music, true, [], true)).not.toContain('href="/hq/dashboard/staff"');
  });
  it("keeps the same hidden inventory entry hidden for a store user", () => {
    const html = render("steamfoot", "a", "/s/store-a/admin/dashboard", false, true, [...ALL_PERMISSIONS], true);
    expect(html).not.toContain("進銷存");
  });
  it.each(["steamfoot", "spa", "course"] as const)("requires staff.view for the common %s staff link", module => {
    const path = "/s/store-a/admin/dashboard";
    expect(render(module, "a", path, false, false)).not.toContain('href="/s/store-a/admin/dashboard/staff"');
    expect(render(module, "a", path, false, false, ["staff.view"])).toContain('href="/s/store-a/admin/dashboard/staff"');
    // Manager/Staff share the backend identity flag with Owner; it is not a grant.
    expect(render(module, "a", path, false, true, [])).not.toContain('href="/s/store-a/admin/dashboard/staff"');
    expect(render(module, "a", path, false, true, ["staff.view"])).toContain('href="/s/store-a/admin/dashboard/staff"');
  });
  it.each([
    ["steamfoot", false], ["spa", false], ["course", false], ["course", true],
  ] as const)("has one common staff-management link in the store sidebar for %s (music=%s)", (module, music) => {
    const html = render(module, "a", "/s/store-a/admin/dashboard", music);
    expect(html.match(/href="\/s\/store-a\/admin\/dashboard\/staff"/g)).toHaveLength(1);
    expect(html).toContain("人員管理");
    if (module === "spa") {
      expect(html).toContain('href="/s/store-a/admin/dashboard/spa-staff"');
      expect(html).toContain("服務與排班");
    }
    if (module === "course") expect(html).toContain(music ? "教師管理" : "教練管理");
  });
  it.each(["steamfoot", "course", "spa"] as const)("retains a store navigation and HQ return for %s", module => {
    const html = render(module, "a");
    expect(html).toContain('aria-label="店舖功能導覽"');
    expect(html).toContain('aria-label="返回 HQ 總部"');
    expect(html).toContain('aria-label="預覽工具"');
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

it.each(["steamfoot", "spa", "course"] as const)("hides audits from %s stores despite all permissions", module => {
  expect(render(module, "a", "/s/store-a/admin/dashboard")).not.toContain("operation-audits");
  expect(render(module, "a", "/hq/dashboard")).not.toContain("operation-audits");
  expect(render(module, null, "/hq/dashboard")).toContain("operation-audits");
});

it.each(["steamfoot", "spa", "course"] as const)("shows granted %s store operation entry without login label", module => {
  const html = render(module, "a", "/s/store-a/admin/dashboard", false, true, [...ALL_PERMISSIONS], false, true, true);
  expect(html).toContain("operation-audits");
  expect(html).toContain("操作紀錄");
  expect(html).not.toContain("操作與登入紀錄");
});
