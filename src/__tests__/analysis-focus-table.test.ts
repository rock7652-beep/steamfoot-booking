import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/dashboard/reports/analysis-detail-link", () => ({
  AnalysisDetailLink: ({ href, children }: { href: string; children: React.ReactNode }) => React.createElement("a", { href }, children),
}));
vi.mock("@/server/queries/monthly-visitor-overview", () => ({
  getMonthlyVisitorOverview: async () => [
    { label: "本月截至今日", count: 68, startDate: "2026-09-01", endDate: "2026-09-26" },
    { label: "上月同期", count: 60, startDate: "2026-08-01", endDate: "2026-08-26" },
    { label: "上月整月", count: 73, startDate: "2026-08-01", endDate: "2026-08-31" },
  ],
}));
import { FocusTable } from "@/app/(dashboard)/dashboard/reports/focus-table";
import { MonthlyVisitorOverview } from "@/app/(dashboard)/dashboard/reports/monthly-visitor-overview";

describe("compact analysis", () => {
  it("labels both exact ranges, preserves zero, and reconstructs the comparison value", () => {
    const html = renderToStaticMarkup(React.createElement(FocusTable, {
      currentDates: "2026-09-01～2026-09-07", previousDates: "2026-08-25～2026-08-31",
      rows: [
        { label: "來客人數", current: 8, difference: 2, unit: "位", href: "/analysis-details?segment=customers" },
        { label: "開卡人數", current: 0, difference: 0, unit: "位" },
        { label: "未提供", unit: "位", href: "/missing" },
      ],
    }));
    expect(html).toContain("2026-09-01～2026-09-07");
    expect(html).toContain("2026-08-25～2026-08-31");
    expect(html).toContain("8 位"); expect(html).toContain("6 位"); expect(html).toContain("+2 位");
    expect(html).toContain("0 位"); expect(html).toContain("持平");
    expect(html).not.toContain('href="/missing"');
  });
  it("uses percentage points for rate differences and rounds floating point artifacts", () => {
    const html = renderToStaticMarkup(React.createElement(FocusTable, {
      currentDates: "本期", previousDates: "比較期",
      rows: [{ label: "開卡率", current: 57.5, difference: 9.600000000000001, unit: "%" }],
    }));
    expect(html).toContain("57.5%"); expect(html).toContain("47.9%"); expect(html).toContain("+9.6 百分點");
  });
  it("only supplements the previous full month when the main table already shows current month", async () => {
    const html = renderToStaticMarkup(await MonthlyVisitorOverview({ storeId: "s1", onlyPreviousMonth: true }));
    expect(html).toContain("73 位"); expect(html).not.toContain("68 位"); expect(html).not.toContain("60 位");
    expect(html).toContain("startDate=2026-08-01&amp;endDate=2026-08-31");
    const other = renderToStaticMarkup(await MonthlyVisitorOverview({ storeId: "s1" }));
    expect(other).toContain("68 位"); expect(other).toContain("60 位"); expect(other).toContain("73 位");
    expect(other).toContain("不隨選區變動");
  });
});
