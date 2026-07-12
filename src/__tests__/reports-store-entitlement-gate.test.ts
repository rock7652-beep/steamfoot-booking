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

describe("ReportsPage advanced_reports entitlement gate", () => {
  it("uses the currently active store id for ADMIN-selected store gating", async () => {
    await ReportsPage({ searchParams: Promise.resolve({ preset: "today" }) });

    expect(mockHasStoreFeature).toHaveBeenCalledWith("store-active", "advanced_reports");
    expect(mockHasStoreFeature).not.toHaveBeenCalledWith("store-own", "advanced_reports");
    expect(mockMonthlyStoreSummary).toHaveBeenCalled();
  });

  it("uses the viewed store id in multi-store view mode", async () => {
    mockResolveStoreViewContextFromCookie.mockResolvedValueOnce({
      isViewMode: true,
      viewedStoreId: "store-viewed",
    });
    mockStoreIdForViewContext.mockReturnValueOnce("store-viewed");

    await ReportsPage({ searchParams: Promise.resolve({ preset: "today" }) });

    expect(mockHasStoreFeature).toHaveBeenCalledWith("store-viewed", "advanced_reports");
  });

  it("renders the store-aware locked copy and does not load report data when blocked", async () => {
    mockHasStoreFeature.mockResolvedValueOnce(false);

    const html = renderToStaticMarkup(
      await ReportsPage({ searchParams: Promise.resolve({ preset: "today" }) }),
    );

    expect(mockMonthlyStoreSummary).not.toHaveBeenCalled();
    expect(mockMonthlyRevenueByCategory).not.toHaveBeenCalled();
    expect(html).toContain("經營診斷尚未開通");
    expect(html).toContain("此功能需使用展店版，或由總部為店舖開通經營診斷功能。");
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

describe("reports advanced_reports source audit", () => {
  const repoRoot = process.cwd();

  it("does not use a plan-only hasFeature gate for /dashboard/reports advanced_reports", () => {
    const source = fs.readFileSync(
      path.join(repoRoot, "src/app/(dashboard)/dashboard/reports/page.tsx"),
      "utf8",
    );

    expect(source).toContain("hasStoreFeature(gateStoreId, FEATURES.ADVANCED_REPORTS)");
    expect(source).not.toContain("hasFeature(pricingPlan, FEATURES.ADVANCED_REPORTS)");
    expect(source).not.toContain("成長版");
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
