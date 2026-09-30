import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PersonalIncomePanel } from "@/components/personal-income-panel";
import { summarizePersonalIncome } from "@/lib/course-personal-income";
import { filterIncomeLines, pageIncomeLines, type PersonalIncomeLine } from "@/lib/personal-income-ui";

const line = (amount: number | null, paid: number | null, label = "伸展瑜珈"): PersonalIncomeLine => ({
  kind: "FEE", label, date: "2026-09-20T02:00:00.000Z", endsAt: null, amount, paid, payments: [],
});

describe("large personal income lists", () => {
  const lines = Array.from({ length: 503 }, (_, index) => line(500, index % 2 ? 500 : 0, `團體班 ${index + 1}`));
  it("keeps all 503 obligations in the monthly total while paging only 50 rows", () => {
    expect(summarizePersonalIncome(lines).total).toBe(251500);
    expect(pageIncomeLines(lines, 1)).toMatchObject({ page: 1, pageCount: 11, start: 1, end: 50 });
    expect(pageIncomeLines(lines, 1).lines).toHaveLength(50);
    expect(pageIncomeLines(lines, 11)).toMatchObject({ start: 501, end: 503, lines: lines.slice(500) });
  });
  it("searches beyond the first page before paginating", () => {
    const selected = filterIncomeLines(lines, "團體班 503");
    expect(pageIncomeLines(selected, 10)).toMatchObject({ page: 1, pageCount: 1, lines: [lines[502]] });
    expect(summarizePersonalIncome(lines).total).toBe(251500);
  });
  it("calculates filter totals across all pages and clamps a stale page", () => {
    const selected = filterIncomeLines(lines, "團體班 5");
    expect(selected).toHaveLength(15);
    expect(summarizePersonalIncome(selected).total).toBe(7500);
    expect(pageIncomeLines(selected, 11)).toMatchObject({ page: 1, pageCount: 1, start: 1, end: 15 });
  });
  it.each([0, -1, NaN, Infinity])("bounds invalid page %s safely", page => {
    expect(pageIncomeLines(lines, page).page).toBe(1);
    expect(pageIncomeLines([], page)).toMatchObject({ page: 1, pageCount: 1, start: 0, end: 0, lines: [] });
  });
  it("renders only 50 disclosure rows for a 503-item report with the full monthly total", () => {
    const html = renderToStaticMarkup(createElement(PersonalIncomePanel, { lines }));
    expect(html.match(/<details\b/g)).toHaveLength(50);
    expect(html).toContain("NT$ 251,500");
    expect(html).toContain("團體班 50");
    expect(html).not.toContain("團體班 51");
  });
});

describe("personal income details without payment status", () => {
  it("searches every payment registration state by name", () => {
    const lines = [line(null, 0), line(500, null), line(500, 600), line(500, 500), line(0, 0)];
    expect(filterIncomeLines(lines, "")).toEqual(lines);
    expect(filterIncomeLines(lines, "  瑜珈 ")).toEqual(lines);
    expect(filterIncomeLines(lines, "找不到")).toEqual([]);
    expect(filterIncomeLines([line(500, 100, "新店 A 基礎伸展")], "  a 基礎 ")).toHaveLength(1);
  });
  it("shows obligations without payment totals, status, history or filters", () => {
    const lines = Array.from({ length: 12 }, (_, index) => ({ ...line(500, index % 2 ? 500 : 0), payments: [{ amount: 500, date: "2026-09-24T02:00:00.000Z", voided: false }] }));
    const html = renderToStaticMarkup(createElement(PersonalIncomePanel, { lines }));
    expect(html).toContain("NT$ 6,000");
    expect(html).toContain('aria-label="搜尋項目"');
    expect(html).toContain("09-20 10:00");
    for (const label of ["已登記付款", "未付", "已付清", "付款紀錄", "付款狀態篩選", "實際入帳", "09-24"]) expect(html).not.toContain(label);
  });
});
