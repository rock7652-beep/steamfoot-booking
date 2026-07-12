import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockCheckPermission = vi.fn();
const mockGetActiveStoreForRead = vi.fn();
const mockResolveStoreViewContextFromCookie = vi.fn();
const mockStoreIdForViewContext = vi.fn();
const mockHasStoreFeature = vi.fn();
const mockGetAdvancedReportsMetrics = vi.fn();
const mockFindStore = vi.fn();
const mockRedirect = vi.fn((href: string) => {
  throw new Error(`redirect:${href}`);
});

vi.mock("next/navigation", () => ({
  redirect: (href: string) => mockRedirect(href),
}));

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
  resolveStoreViewContextFromCookie: (...args: unknown[]) =>
    mockResolveStoreViewContextFromCookie(...args),
  storeIdForViewContext: (...args: unknown[]) => mockStoreIdForViewContext(...args),
}));

vi.mock("@/lib/feature-gate", () => ({
  hasStoreFeature: (...args: unknown[]) => mockHasStoreFeature(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    store: {
      findUnique: (...args: unknown[]) => mockFindStore(...args),
    },
  },
}));

vi.mock("@/server/services/advanced-reports", () => ({
  getAdvancedReportsMetrics: (...args: unknown[]) => mockGetAdvancedReportsMetrics(...args),
}));

vi.mock("@/app/(dashboard)/dashboard/advanced-reports/month-filter", () => ({
  MonthFilter: ({ month }: { month: string }) =>
    React.createElement("form", null, React.createElement("input", { name: "month", value: month, readOnly: true })),
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
  KpiStrip: ({ items }: { items: Array<{ label: string; value: string }> }) =>
    React.createElement(
      "section",
      null,
      items.map((item) => `${item.label}:${item.value}`).join(","),
    ),
  DataTable: () => React.createElement("table", null),
  EmptyRow: ({ title, hint }: { title: string; hint?: string }) =>
    React.createElement("div", null, `${title}${hint ?? ""}`),
}));

import AdvancedReportsPage from "@/app/(dashboard)/dashboard/advanced-reports/page";

const OWNER = {
  id: "user-1",
  role: "OWNER",
  staffId: "staff-1",
  storeId: "store-1",
};

const EMPTY_METRICS = {
  range: {
    startDate: "2026-07-01",
    endDate: "2026-07-31",
  },
  trialConversion: { numerator: 0, denominator: 0, rate: 0 },
  renewal: { numerator: 0, denominator: 0, rate: 0 },
  revisit: { numerator: 0, denominator: 0, rate: 0 },
  averageOrderValue: { revenue: 0, transactionCount: 0, averageOrderValue: 0 },
  customerActivity: { totalCustomers: 0, activeCustomers: 0, dormantCustomers: 0 },
  monthlyRevenueTrend: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(OWNER);
  mockCheckPermission.mockResolvedValue(true);
  mockGetActiveStoreForRead.mockResolvedValue("store-1");
  mockResolveStoreViewContextFromCookie.mockResolvedValue(null);
  mockStoreIdForViewContext.mockImplementation((fallbackStoreId: string | null) => fallbackStoreId);
  mockHasStoreFeature.mockResolvedValue(true);
  mockGetAdvancedReportsMetrics.mockResolvedValue(EMPTY_METRICS);
  mockFindStore.mockResolvedValue({ name: "Steamfoot Staging / 測試店" });
});

describe("AdvancedReportsPage feature gate", () => {
  it("blocks a GROWTH store when advanced_reports is disabled", async () => {
    mockHasStoreFeature.mockResolvedValueOnce(false);

    const html = renderToStaticMarkup(
      await AdvancedReportsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(mockHasStoreFeature).toHaveBeenCalledWith("store-1", "advanced_reports");
    expect(mockGetAdvancedReportsMetrics).not.toHaveBeenCalled();
    expect(html).toContain("經營診斷尚未開通");
    expect(html).toContain("請聯絡總部加購或升級方案");
    expect(html).toContain("返回儀表板");
  });

  it("allows /dashboard/advanced-reports when advanced_reports is enabled", async () => {
    const html = renderToStaticMarkup(
      await AdvancedReportsPage({ searchParams: Promise.resolve({ month: "2026-07" }) }),
    );

    expect(mockHasStoreFeature).toHaveBeenCalledWith("store-1", "advanced_reports");
    expect(mockGetAdvancedReportsMetrics).toHaveBeenCalledWith({
      storeId: "store-1",
      month: "2026-07",
    });
    expect(html).toContain("體驗轉換率");
    expect(html).toContain("本期尚無經營診斷資料");
  });

  it("keeps the HQ all-store view available when there is no concrete store id to gate", async () => {
    mockGetActiveStoreForRead.mockResolvedValueOnce(null);
    mockStoreIdForViewContext.mockReturnValueOnce(null);

    const html = renderToStaticMarkup(
      await AdvancedReportsPage({ searchParams: Promise.resolve({ month: "2026-07" }) }),
    );

    expect(mockHasStoreFeature).not.toHaveBeenCalled();
    expect(mockGetAdvancedReportsMetrics).toHaveBeenCalledWith({
      storeId: null,
      month: "2026-07",
    });
    expect(html).toContain("全部店舖");
    expect(html).toContain("體驗轉換率");
  });
});
