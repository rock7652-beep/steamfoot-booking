import { describe, expect, it } from "vitest";
import { filterIncomeLines, incomePaymentStatus, type PersonalIncomeLine } from "@/lib/personal-income-ui";

const line = (amount: number | null, paid: number | null, label = "伸展瑜珈"): PersonalIncomeLine => ({
  kind: "FEE", label, date: "2026-09-20T02:00:00.000Z", endsAt: null, amount, paid, payments: [],
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
