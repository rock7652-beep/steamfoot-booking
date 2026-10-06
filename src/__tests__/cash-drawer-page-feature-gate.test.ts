// Cost access is covered by inventory-finance-access.test.ts; these cases retain their original finance scope.
vi.mock("@/server/inventory-finance-access",()=>({requireInventoryFinanceAccess:async()=>{},canReadInventoryFinance:async()=>true,inventoryCashbookReadFilter:async()=>({})}));
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockCheckPermission = vi.fn();
const mockGetActiveStoreForRead = vi.fn();
const mockHasStoreFeature = vi.fn();
const mockGetCashDrawerView = vi.fn();
const mockListClosedBusinessDates = vi.fn();
const mockListStaffSelectOptions = vi.fn();
const mockRedirect = vi.fn((href: string) => {
  throw new Error(`redirect:${href}`);
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({replace: vi.fn()}),
  redirect: (href: string) => mockRedirect(href),
}));

vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: async () => "steamfoot" }));

vi.mock("@/lib/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/permissions", () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
}));

vi.mock("@/lib/store", () => ({
  getActiveStoreForRead: (...args: unknown[]) => mockGetActiveStoreForRead(...args),
}));

vi.mock("@/lib/store-view-context-server", () => ({
  resolveStoreViewContextFromCookie: vi.fn().mockResolvedValue(null),
  storeIdForViewContext: (fallbackStoreId: string | null) => fallbackStoreId,
}));

vi.mock("@/lib/feature-gate", () => ({
  hasStoreFeature: (...args: unknown[]) => mockHasStoreFeature(...args),
}));

vi.mock("@/server/queries/cash-drawer", () => ({
  getCashDrawerView: (...args: unknown[]) => mockGetCashDrawerView(...args),
  listClosedBusinessDates: (...args: unknown[]) => mockListClosedBusinessDates(...args),
}));

vi.mock("@/server/queries/staff", () => ({
  listStaffSelectOptions: (...args: unknown[]) => mockListStaffSelectOptions(...args),
}));

vi.mock("@/components/dashboard-link", () => ({
  DashboardLink: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => React.createElement("a", { href, className }, children),
}));

vi.mock("@/components/desktop", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) =>
    React.createElement("main", null, children),
  PageHeader: ({
    title,
    subtitle,
    actions,
  }: {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
  }) =>
    React.createElement(
      "header",
      null,
      React.createElement("h1", null, title),
      subtitle ? React.createElement("p", null, subtitle) : null,
      actions,
    ),
}));

vi.mock("@/app/(dashboard)/dashboard/cash-drawer/cash-drawer-workspace", () => ({
  CashDrawerWorkspace: (props: {returnPath: string; canOpen: boolean; canClose: boolean}) => React.createElement("section", {"data-return-path": props.returnPath, "data-can-open": String(props.canOpen), "data-can-close": String(props.canClose)}, "cash drawer workspace"),
}));

import CashDrawerPage from "@/app/(dashboard)/dashboard/cash-drawer/page";

const OWNER = {
  id: "user-1",
  role: "OWNER",
  staffId: "staff-1",
  storeId: "store-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(OWNER);
  mockCheckPermission.mockResolvedValue(true);
  mockGetActiveStoreForRead.mockResolvedValue("store-1");
  mockHasStoreFeature.mockResolvedValue(true);
  mockGetCashDrawerView.mockResolvedValue({ state: "EMPTY" });
  mockListClosedBusinessDates.mockResolvedValue([]);
  mockListStaffSelectOptions.mockResolvedValue([]);
});

describe("CashDrawerPage feature gate", () => {
  it("renders a friendly locked state instead of querying cash drawer data when cash_drawer is disabled", async () => {
    mockHasStoreFeature.mockResolvedValueOnce(false);

    const html = renderToStaticMarkup(
      await CashDrawerPage({ searchParams: Promise.resolve({}) }),
    );

    expect(mockHasStoreFeature).toHaveBeenCalledWith("store-1", "cash_drawer");
    expect(mockGetCashDrawerView).not.toHaveBeenCalled();
    expect(html).toContain("現金抽屜尚未開通");
    expect(html).toContain("請聯絡總部加購或升級方案");
    expect(html).toContain("返回儀表板");
  });
});


describe("cash drawer embedded store boundary", () => {
  it("does not query amounts after the active store changes", async () => {
    const html = renderToStaticMarkup(await CashDrawerPage({searchParams: Promise.resolve({cashDrawerPanel: "1", panelStoreId: "another-store"})}));
    expect(html).toContain("店家已切換");
    expect(mockGetCashDrawerView).not.toHaveBeenCalled();
  });
  it("keeps successful writes inside the selected store panel and preserves separate grants", async () => {
    mockCheckPermission.mockImplementation(async (_role, _staff, permission) => permission !== "cashDrawer.close");
    const html = renderToStaticMarkup(await CashDrawerPage({searchParams: Promise.resolve({cashDrawerPanel: "1", panelStoreId: "store-1", panelPrefix: "/hq"})}));
    expect(html).toContain('data-return-path="/hq/dashboard/cash-drawer?cashDrawerPanel=1');
    expect(html).toContain('data-can-open="true"');
    expect(html).toContain('data-can-close="false"');
    expect(html).not.toContain("查看收支明細");
  });
  it("rejects denied read permission without loading financial data", async () => {
    mockCheckPermission.mockResolvedValue(false);
    const html = renderToStaticMarkup(await CashDrawerPage({searchParams: Promise.resolve({cashDrawerPanel: "1", panelStoreId: "store-1"})}));
    expect(html).toContain("沒有查看現金抽屜的權限");
    expect(mockGetCashDrawerView).not.toHaveBeenCalled();
  });
});
