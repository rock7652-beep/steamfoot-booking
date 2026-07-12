import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockCheckPermission = vi.fn();
const mockGetActiveStoreForRead = vi.fn();
const mockResolveStoreViewContextFromCookie = vi.fn();
const mockStoreIdForViewContext = vi.fn();
const mockGetCachedStorePlan = vi.fn();
const mockHasStoreFeature = vi.fn();
const mockHasDataExportFeature = vi.fn();
const mockMonthlyStoreSummary = vi.fn();
const mockMonthlyRevenueByCategory = vi.fn();
const mockGetReportSnapshotWithMeta = vi.fn();
const mockUpsertReportSnapshot = vi.fn();
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

vi.mock("@/lib/query-cache", () => ({
  getCachedStorePlan: (...args: unknown[]) => mockGetCachedStorePlan(...args),
}));

vi.mock("@/lib/feature-gate", () => ({
  hasStoreFeature: (...args: unknown[]) => mockHasStoreFeature(...args),
}));

vi.mock("@/lib/data-export-gate", () => ({
  DATA_EXPORT_LOCKED_MESSAGE: "資料匯出尚未開通",
  DATA_EXPORT_SELECT_STORE_MESSAGE: "請先選擇店舖",
  hasDataExportFeature: (...args: unknown[]) => mockHasDataExportFeature(...args),
}));

vi.mock("@/server/queries/report", () => ({
  monthlyStoreSummary: (...args: unknown[]) => mockMonthlyStoreSummary(...args),
  monthlyRevenueByCategory: (...args: unknown[]) => mockMonthlyRevenueByCategory(...args),
}));

vi.mock("@/server/queries/report-snapshot", () => ({
  getReportSnapshotWithMeta: (...args: unknown[]) => mockGetReportSnapshotWithMeta(...args),
  upsertReportSnapshot: (...args: unknown[]) => mockUpsertReportSnapshot(...args),
}));

vi.mock("@/components/report-date-range", () => ({
  default: () => React.createElement("form", null, "date range"),
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

vi.mock("@/components/feature-gate", () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
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

vi.mock("@/lib/perf", () => ({
  ServerTiming: class {
    cacheStatus() {}
    finish() {}
  },
  withTiming: (_label: string, _timer: unknown, fn: () => unknown) => fn(),
}));

import ReportsPage from "@/app/(dashboard)/dashboard/reports/page";

const OWNER = {
  id: "user-1",
  role: "OWNER",
  staffId: "staff-1",
  storeId: "store-own",
};

const STORE_SUMMARY = {
  netCourseRevenue: 12000,
  completedBookings: 3,
  totalRefund: 0,
  staffBreakdown: [],
};

const REVENUE_BY_CATEGORY: unknown[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(OWNER);
  mockCheckPermission.mockResolvedValue(true);
  mockGetActiveStoreForRead.mockResolvedValue("store-active");
  mockResolveStoreViewContextFromCookie.mockResolvedValue(null);
  mockStoreIdForViewContext.mockImplementation((fallbackStoreId: string | null) => fallbackStoreId);
  mockGetCachedStorePlan.mockResolvedValue("GROWTH");
  mockHasStoreFeature.mockResolvedValue(true);
  mockHasDataExportFeature.mockResolvedValue(false);
  mockMonthlyStoreSummary.mockResolvedValue(STORE_SUMMARY);
  mockMonthlyRevenueByCategory.mockResolvedValue(REVENUE_BY_CATEGORY);
  mockGetReportSnapshotWithMeta.mockResolvedValue(null);
  mockUpsertReportSnapshot.mockResolvedValue(undefined);
});

describe("ReportsPage basic_reports entitlement gate", () => {
  it("keeps existing data and entries while presenting the new information hierarchy", async () => {
    const html = renderToStaticMarkup(
      await ReportsPage({ searchParams: Promise.resolve({ preset: "today" }) }),
    );

    expect(html).toContain("營運分析");
    expect(html).toContain("營運摘要");
    expect(html).toContain("本期營收");
    expect(html).toContain("完成服務");
    expect(html).toContain("訂單數");
    expect(html).toContain("退款");
    expect(html).toContain("營收分析");
    expect(html).toContain("店長分析");
    expect(html).not.toContain("店長明細");
    expect(html).not.toContain("收入類型</h2>");
    expect(html).not.toMatch(/基本報表|進階報表/);
    expect(html).toContain("經營診斷 →");
    expect(html).toContain("月結管理 →");
    expect(html).toContain("date range");
    expect(mockMonthlyStoreSummary).toHaveBeenCalledTimes(1);
    expect(mockMonthlyRevenueByCategory).toHaveBeenCalledTimes(1);
  });

  it("allows a GROWTH store even when advanced_reports is unavailable", async () => {
    mockHasStoreFeature.mockImplementation(
      async (_storeId: string, feature: string) => feature !== "advanced_reports",
    );

    const html = renderToStaticMarkup(
      await ReportsPage({ searchParams: Promise.resolve({ preset: "today" }) }),
    );

    expect(mockGetCachedStorePlan).toHaveBeenCalled();
    expect(mockHasStoreFeature).toHaveBeenCalledWith("store-active", "basic_reports");
    expect(mockHasStoreFeature).not.toHaveBeenCalledWith("store-active", "advanced_reports");
    expect(mockMonthlyStoreSummary).toHaveBeenCalled();
    expect(html).toContain("營運分析");
    expect(html).not.toContain("營運分析尚未開通");
    expect(html).not.toContain("經營診斷尚未開通");
  });

  it("uses the currently active store id for ADMIN-selected store gating", async () => {
    await ReportsPage({ searchParams: Promise.resolve({ preset: "today" }) });

    expect(mockHasStoreFeature).toHaveBeenCalledWith("store-active", "basic_reports");
    expect(mockHasStoreFeature).not.toHaveBeenCalledWith("store-own", "basic_reports");
    expect(mockMonthlyStoreSummary).toHaveBeenCalled();
  });

  it("uses the viewed store id in multi-store view mode", async () => {
    mockResolveStoreViewContextFromCookie.mockResolvedValueOnce({
      isViewMode: true,
      viewedStoreId: "store-viewed",
    });
    mockStoreIdForViewContext.mockReturnValueOnce("store-viewed");

    await ReportsPage({ searchParams: Promise.resolve({ preset: "today" }) });

    expect(mockHasStoreFeature).toHaveBeenCalledWith("store-viewed", "basic_reports");
  });

  it("renders the store-aware locked copy and does not load report data when blocked", async () => {
    mockHasStoreFeature.mockResolvedValueOnce(false);

    const html = renderToStaticMarkup(
      await ReportsPage({ searchParams: Promise.resolve({ preset: "today" }) }),
    );

    expect(mockMonthlyStoreSummary).not.toHaveBeenCalled();
    expect(mockMonthlyRevenueByCategory).not.toHaveBeenCalled();
    expect(html).toContain("營運分析尚未開通");
    expect(html).toContain("請聯絡總部開通營運分析功能。");
    expect(html).not.toContain("經營診斷");
    expect(html).not.toContain("成長版");
  });

  it("keeps the HQ all-store report view available when there is no concrete store id to gate", async () => {
    mockGetActiveStoreForRead.mockResolvedValueOnce(null);
    mockStoreIdForViewContext.mockReturnValueOnce(null);

    await ReportsPage({ searchParams: Promise.resolve({ preset: "today" }) });

    expect(mockHasStoreFeature).not.toHaveBeenCalled();
    expect(mockMonthlyStoreSummary).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ activeStoreId: null }),
    );
  });
});

describe("reports basic_reports source audit", () => {
  const repoRoot = process.cwd();

  it("gates /dashboard/reports with BASIC_REPORTS, never ADVANCED_REPORTS", () => {
    const source = fs.readFileSync(
      path.join(repoRoot, "src/app/(dashboard)/dashboard/reports/page.tsx"),
      "utf8",
    );

    expect(source).toContain("hasStoreFeature(gateStoreId, FEATURES.BASIC_REPORTS)");
    expect(source).not.toContain("hasStoreFeature(gateStoreId, FEATURES.ADVANCED_REPORTS)");
    expect(source).not.toContain("經營診斷尚未開通");
    expect(source).not.toContain("成長版");
  });

  it("keeps the existing report queries, feature gate, and entitlement checks", () => {
    const source = fs.readFileSync(
      path.join(repoRoot, "src/app/(dashboard)/dashboard/reports/page.tsx"),
      "utf8",
    );

    expect(source).toContain("monthlyStoreSummary");
    expect(source).toContain("monthlyRevenueByCategory");
    expect(source).toContain("getReportSnapshotWithMeta");
    expect(source).toContain("hasDataExportFeature");
    expect(source).toContain("hasStoreFeature(gateStoreId, FEATURES.BASIC_REPORTS)");
    expect(source).toContain("<FeatureGate plan={plan} feature={FEATURES.BASIC_REPORTS}>");
  });

  it("keeps related revenue report pages store-aware for advanced_reports", () => {
    for (const filePath of [
      "src/app/(dashboard)/dashboard/store-revenue/page.tsx",
      "src/app/(dashboard)/dashboard/coach-revenue/page.tsx",
    ]) {
      const source = fs.readFileSync(path.join(repoRoot, filePath), "utf8");

      expect(source).toContain("hasStoreFeature(gateStoreId, FF.ADVANCED_REPORTS)");
      expect(source).not.toContain("hasPricingFeature(pricingPlan, FF.ADVANCED_REPORTS)");
      expect(source).not.toContain("需要 PRO 方案");
    }
  });
});
