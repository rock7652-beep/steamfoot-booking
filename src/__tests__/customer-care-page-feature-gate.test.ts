import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockCheckPermission = vi.fn();
const mockGetActiveStoreForRead = vi.fn();
const mockHasStoreFeature = vi.fn();
const mockGetCustomerCareOverview = vi.fn();
const mockGetMonthlyUnconvertedCustomers = vi.fn();
const mockRedirect = vi.fn((href: string) => {
  throw new Error(`redirect:${href}`);
});

vi.mock("next/navigation", () => ({
  redirect: (href: string) => mockRedirect(href),
  useRouter: () => ({ refresh: vi.fn() }),
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

vi.mock("@/lib/feature-gate", () => ({
  hasStoreFeature: (...args: unknown[]) => mockHasStoreFeature(...args),
}));

vi.mock("@/server/queries/customer-care", () => ({
  getCustomerCareOverview: (...args: unknown[]) => mockGetCustomerCareOverview(...args),
}));

vi.mock("@/server/queries/conversion-metrics", () => ({
  getMonthlyUnconvertedCustomers: (...args: unknown[]) =>
    mockGetMonthlyUnconvertedCustomers(...args),
}));

vi.mock("@/lib/store-view-context-server", () => ({
  resolveStoreViewContextFromCookie: vi.fn().mockResolvedValue(null),
  storeIdForViewContext: (storeId: string | null) => storeId,
  userForViewContext: (user: unknown) => user,
}));

vi.mock("@/server/actions/customer-follow-up", () => ({
  createCustomerFollowUpAction: vi.fn(),
}));

vi.mock("@/components/dashboard-link", () => ({
  DashboardLink: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
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
  KpiStrip: ({ items }: { items: Array<{ label: string; value: number }> }) =>
    React.createElement("section", null, items.map((item) => `${item.label}:${item.value}`).join(",")),
  DataTable: ({
    rows,
    columns,
    empty,
  }: {
    rows: Array<Record<string, unknown>>;
    columns: Array<{ key: string; accessor?: (row: Record<string, unknown>) => React.ReactNode }>;
    empty?: React.ReactNode;
  }) =>
    rows.length === 0
      ? React.createElement("div", null, empty)
      : React.createElement(
          "table",
          null,
          React.createElement(
            "tbody",
            null,
            rows.map((row, index) =>
              React.createElement(
                "tr",
                { key: String(row.customerId ?? index) },
                columns.map((column) =>
                  React.createElement(
                    "td",
                    { key: column.key },
                    column.accessor?.(row) ?? String(row[column.key] ?? ""),
                  ),
                ),
              ),
            ),
          ),
        ),
}));

import CustomerCarePage from "@/app/(dashboard)/dashboard/growth/page";

const OWNER = { id: "user-1", role: "OWNER", staffId: "staff-1", storeId: "store-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(OWNER);
  mockCheckPermission.mockResolvedValue(true);
  mockGetActiveStoreForRead.mockResolvedValue("store-1");
  mockHasStoreFeature.mockResolvedValue(true);
  mockGetCustomerCareOverview.mockResolvedValue({
    trialFollowUps: [],
    inactiveCustomers: [],
    lowSessionCustomers: [],
    expiringPlanCustomers: [],
    summary: {
      trialFollowUps: 0,
      inactiveCustomers: 0,
      lowSessionCustomers: 0,
      expiringPlanCustomers: 0,
    },
  });
  mockGetMonthlyUnconvertedCustomers.mockResolvedValue([]);
});

describe("CustomerCarePage feature gate", () => {
  it("renders a friendly locked state instead of throwing when customer_care is disabled", async () => {
    mockHasStoreFeature.mockResolvedValueOnce(false);

    const html = renderToStaticMarkup(await CustomerCarePage());

    expect(mockHasStoreFeature).toHaveBeenCalledWith("store-1", "customer_care");
    expect(mockGetCustomerCareOverview).not.toHaveBeenCalled();
    expect(html).toContain("此功能尚未開通");
    expect(html).toContain("請聯絡總部加購或升級方案");
    expect(html).toContain("返回儀表板");
  });

  it("parses the monthly-unconverted segment and renders only its dedicated customer list", async () => {
    mockGetMonthlyUnconvertedCustomers.mockResolvedValueOnce([
      {
        customerId: "customer-b",
        customerName: "測試顧客 B",
        customerPhone: "0911000002",
        trialCompletedAt: new Date("2026-07-13T00:00:00.000Z"),
        assignedStaffName: "測試店長",
        lastFollowUp: null,
      },
    ]);

    const html = renderToStaticMarkup(
      await CustomerCarePage({
        searchParams: Promise.resolve({
          segment: "monthly-unconverted",
          month: "2026-07",
        }),
      }),
    );

    expect(mockGetMonthlyUnconvertedCustomers).toHaveBeenCalledWith("store-1", "2026-07");
    expect(html).toContain("本月體驗未開卡");
    expect(html).toContain("測試顧客 B");
    expect(html).toContain("2026-07 完成體驗");
    expect(html).not.toContain("測試顧客 E");
  });
});
