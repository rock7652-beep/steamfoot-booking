import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockCheckPermission = vi.fn();
const mockGetActiveStoreForRead = vi.fn();
const mockResolveStoreViewContextFromCookie = vi.fn();
const mockStoreIdForViewContext = vi.fn();
const mockHasStoreFeature = vi.fn();
const mockGetServiceFeeCalculatorSummary = vi.fn();
const mockGetStoreSettlementForStoreByMonth = vi.fn();
const mockGetStoreSettlementsForStore = vi.fn();
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

vi.mock("@/server/services/service-fee-calculator", () => ({
  getServiceFeeCalculatorSummary: (...args: unknown[]) =>
    mockGetServiceFeeCalculatorSummary(...args),
}));

vi.mock("@/server/services/store-settlements", () => ({
  getStoreSettlementForStoreByMonth: (...args: unknown[]) =>
    mockGetStoreSettlementForStoreByMonth(...args),
  getStoreSettlementsForStore: (...args: unknown[]) => mockGetStoreSettlementsForStore(...args),
}));

vi.mock("@/app/(dashboard)/dashboard/advanced-reports/month-filter", () => ({
  MonthFilter: ({ month }: { month: string }) =>
    React.createElement(
      "form",
      null,
      React.createElement("input", { name: "month", value: month, readOnly: true }),
    ),
}));

vi.mock("@/app/(dashboard)/dashboard/service-fee-calculator/calculator-form", () => ({
  ServiceFeeCalculatorForm: () =>
    React.createElement("section", null, "service fee calculator form"),
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

vi.mock("@/components/ui/empty-state", () => ({
  EmptyState: ({
    title,
    description,
    action,
  }: {
    title: string;
    description?: string;
    action?: { label: string; href: string };
  }) =>
    React.createElement(
      "section",
      null,
      React.createElement("h2", null, title),
      description ? React.createElement("p", null, description) : null,
      action ? React.createElement("a", { href: action.href }, action.label) : null,
    ),
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
  EmptyRow: ({ title, hint }: { title: string; hint?: string }) =>
    React.createElement("div", null, `${title}${hint ?? ""}`),
}));

import ServiceFeeCalculatorPage from "@/app/(dashboard)/dashboard/service-fee-calculator/page";

const OWNER = {
  id: "user-1",
  role: "OWNER",
  staffId: "staff-1",
  storeId: "store-1",
};

const SUMMARY = {
  month: "2026-07",
  storeId: "store-1",
  storeName: "Steamfoot Staging / 測試店",
  range: {
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    transactionStart: new Date("2026-07-01T00:00:00.000Z"),
    transactionEnd: new Date("2026-07-31T15:59:59.999Z"),
  },
  grossRevenue: 12000,
  refundAmount: 2000,
  netRevenue: 10000,
  revenueTransactionCount: 5,
  refundTransactionCount: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(OWNER);
  mockCheckPermission.mockResolvedValue(true);
  mockGetActiveStoreForRead.mockResolvedValue("store-1");
  mockResolveStoreViewContextFromCookie.mockResolvedValue(null);
  mockStoreIdForViewContext.mockImplementation((fallbackStoreId: string | null) => fallbackStoreId);
  mockHasStoreFeature.mockResolvedValue(true);
  mockGetServiceFeeCalculatorSummary.mockResolvedValue(SUMMARY);
  mockGetStoreSettlementForStoreByMonth.mockResolvedValue(null);
  mockGetStoreSettlementsForStore.mockResolvedValue([]);
});

describe("ServiceFeeCalculatorPage feature gate", () => {
  it("renders a friendly locked state instead of loading settlement data when disabled", async () => {
    mockHasStoreFeature.mockResolvedValueOnce(false);

    const html = renderToStaticMarkup(
      await ServiceFeeCalculatorPage({ searchParams: Promise.resolve({ month: "2026-07" }) }),
    );

    expect(mockHasStoreFeature).toHaveBeenCalledWith(
      "store-1",
      "service_fee_calculator",
    );
    expect(mockGetServiceFeeCalculatorSummary).not.toHaveBeenCalled();
    expect(mockGetStoreSettlementForStoreByMonth).not.toHaveBeenCalled();
    expect(mockGetStoreSettlementsForStore).not.toHaveBeenCalled();
    expect(html).toContain("營運結算工具尚未開通");
    expect(html).toContain("請聯絡總部加購或升級方案");
    expect(html).toContain("返回儀表板");
  });

  it("renders the calculator when service_fee_calculator is enabled", async () => {
    const html = renderToStaticMarkup(
      await ServiceFeeCalculatorPage({ searchParams: Promise.resolve({ month: "2026-07" }) }),
    );

    expect(mockHasStoreFeature).toHaveBeenCalledWith(
      "store-1",
      "service_fee_calculator",
    );
    expect(mockGetServiceFeeCalculatorSummary).toHaveBeenCalledWith({
      storeId: "store-1",
      month: "2026-07",
    });
    expect(mockGetStoreSettlementForStoreByMonth).toHaveBeenCalledWith("store-1", "2026-07");
    expect(mockGetStoreSettlementsForStore).toHaveBeenCalledWith("store-1");
    expect(html).toContain("營運結算工具");
    expect(html).toContain("service fee calculator form");
  });
});
