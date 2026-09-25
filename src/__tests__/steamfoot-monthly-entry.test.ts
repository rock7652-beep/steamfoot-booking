import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/dashboard-link", () => ({
  DashboardLink: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children),
}));
vi.mock("@/app/(dashboard)/dashboard/cashbook/_components/cashbook-shortcut", () => ({
  CashbookShortcut: () => createElement("button", null, "現金帳"),
}));
import { RevenueTabs } from "@/app/(dashboard)/dashboard/revenue/_components/revenue-tabs";

describe("Steamfoot monthly operations entry", () => {
  it("adds monthly beside cash management when enabled", () => {
    const html = renderToStaticMarkup(createElement(RevenueTabs, { readOnly: false, showMonthly: true }));
    expect(html).toContain('href="/dashboard/service-fee-calculator"');
    expect(html).toContain("月結管理");
    expect(html).toContain("完整現金管理");
    expect(html).not.toContain("col-span-2");
  });
  it("does not change other modules by default", () => {
    const html = renderToStaticMarkup(createElement(RevenueTabs, { readOnly: false }));
    expect(html).not.toContain("月結管理");
    expect(html).toContain("col-span-2");
  });
  it("keeps read-only access to monthly reports", () => {
    expect(renderToStaticMarkup(createElement(RevenueTabs, { readOnly: true, showMonthly: true }))).toContain("月結管理");
  });
  it("gates the entry by Steamfoot, role, permission and entitlement", () => {
    const source = readFileSync("src/app/(dashboard)/dashboard/revenue/page.tsx", "utf8");
    const guard = source.slice(source.indexOf("const showMonthly"), source.indexOf("const today"));
    expect(guard).toContain('getStoreIndustryModule(revenueStoreId) === "steamfoot"');
    expect(guard).toContain('user.role === "OWNER" || user.role === "ADMIN"');
    expect(guard).toContain('"report.read"');
    expect(guard).toContain("FEATURES.SERVICE_FEE_CALCULATOR");
    expect(source.indexOf("showMonthly={showMonthly}")).toBeLessThan(source.indexOf("<KpiStrip"));
    expect(readFileSync("src/app/(dashboard)/dashboard/reports/page.tsx", "utf8")).toContain('href="/dashboard/service-fee-calculator"');
  });
});
