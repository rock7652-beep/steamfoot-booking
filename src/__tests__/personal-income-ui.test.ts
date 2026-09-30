import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PersonalIncomePanel } from "@/components/personal-income-panel";
import { summarizePersonalIncome } from "@/lib/course-personal-income";
import { filterIncomeLines, incomePaymentStatus, pageIncomeLines, type PersonalIncomeLine } from "@/lib/personal-income-ui";

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
    const selected = filterIncomeLines(lines, "all", "團體班 503");
    expect(pageIncomeLines(selected, 10)).toMatchObject({ page: 1, pageCount: 1, lines: [lines[502]] });
    expect(summarizePersonalIncome(lines).total).toBe(251500);
  });
  it("calculates filter totals across all pages and clamps a stale page", () => {
    const selected = filterIncomeLines(lines, "paid", "");
    expect(selected).toHaveLength(251);
    expect(summarizePersonalIncome(selected).total).toBe(125500);
    expect(pageIncomeLines(selected, 11)).toMatchObject({ page: 6, pageCount: 6, start: 251, end: 251 });
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

describe("personal income payment status", () => {
  it.each([
    [null, 0, "待核對"], [500, null, "待核對"], [0, 0, "無應付金額"],
    [500, 0, "未付"], [500, 200, "部分已付"], [500, 500, "已付清"], [500, 600, "溢付待核對"],
  ] as const)("amount %s and paid %s means %s", (amount, paid, status) => {
    expect(incomePaymentStatus({ amount, paid })).toBe(status);
  });
  it("does not hide unknown or overpaid amounts in the paid filter", () => {
    const lines = [line(null, 0), line(500, null), line(500, 600), line(500, 500), line(0, 0)];
    expect(filterIncomeLines(lines, "paid", "")).toEqual([lines[3]]);
    expect(filterIncomeLines(lines, "all", "")).toHaveLength(5);
  });
  it("combines partial unpaid filtering and case-insensitive trimmed name search", () => {
    const lines = [line(500, 100, "新店 A 基礎伸展"), line(500, 0, "瑜珈"), line(500, 500, "新店 A 基礎伸展")];
    expect(filterIncomeLines(lines, "unpaid", "  a 基礎 ")).toEqual([lines[0]]);
    expect(filterIncomeLines(lines, "all", "找不到")).toEqual([]);
  });
});
