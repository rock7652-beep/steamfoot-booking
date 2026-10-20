import { describe, expect, it } from "vitest";
import { consumptionCsv, consumptionMetrics, consumptionSearchParams, parseConsumptionFilters } from "@/lib/customer-consumption";
import { findOperationGuides, relatedOperationGuides } from "@/lib/operation-guide";

describe("customer consumption filters and export", () => {
  it("uses Taiwan period presets including leap month and inclusive rolling windows", () => {
    expect(parseConsumptionFilters({}, "2026-10-20")).toMatchObject({ startDate: "2026-10-01", endDate: "2026-10-20", includeAbsent: true });
    expect(parseConsumptionFilters({ preset: "lastMonth" }, "2024-03-01")).toMatchObject({ startDate: "2024-02-01", endDate: "2024-02-29" });
    expect(parseConsumptionFilters({ preset: "30" }, "2026-10-20").startDate).toBe("2026-09-21");
    expect(parseConsumptionFilters({ preset: "90" }, "2026-10-20").startDate).toBe("2026-07-23");
  });
  it.each([
    { preset: "custom", startDate: "2026-02-30", endDate: "2026-03-01" },
    { preset: "custom", startDate: "2026-10-21", endDate: "2026-10-20" },
    { count_min: "5", count_max: "2" }, { amount_min: "NaN" }, { points_max: "-1" },
    { amount_min: "Infinity" }, { top: "0" }, { top: "10001" }, { page: "-1" },
    { sort: "__proto__" }, { direction: "DROP TABLE" },
  ])("rejects invalid filters without silently broadening the result: %j", params => {
    expect(() => parseConsumptionFilters(params, "2026-10-20")).toThrow();
  });
  it("keeps the exact period, zeros, AND ranges, absent choice, sort and top in export/pagination links", () => {
    const filters = parseConsumptionFilters({ preset: "90", planId: "plan-1", q: "王", count_min: "0", points_max: "20", includeAbsent: "0", sort: "points", direction: "asc", top: "20", page: "2" }, "2026-10-20");
    const query = consumptionSearchParams(filters);
    expect(parseConsumptionFilters(Object.fromEntries(query), "2026-12-01")).toEqual({ ...filters, preset: "custom", page: 1 });
  });
  it("only shows units used by this store", () => {
    expect(consumptionMetrics([{ id: "1", name: "堂數", unit: "SESSION" }])).toEqual(["count", "sessions", "amount", "paid"]);
    expect(consumptionMetrics([{ id: "1", name: "點數", unit: "POINT" }, { id: "2", name: "格數", unit: "GRID" }])).toEqual(["count", "grids", "points", "amount", "paid"]);
    expect(consumptionMetrics([{ id: "1", name: "已改收費方式", unit: "SESSION", units: ["POINT"] }])).toContain("points");
  });
  it("supports negative net receipts when period refunds exceed payments", () => {
    expect(parseConsumptionFilters({ paid_min: "-1000", paid_max: "-1" }, "2026-10-20").ranges.paid).toEqual({ min: -1000, max: -1 });
  });
  it("exports context and safely quotes multiline names and spreadsheet formulas", () => {
    const filters = parseConsumptionFilters({ count_min: "0", top: "2", direction: "asc" }, "2026-10-20");
    const csv = consumptionCsv([{ id: "a", name: '=HYPERLINK("bad")\n王', phone: "+886900000000", assignedStaffName: "林店長", count: 1, sessions: 2, grids: 0, points: 0, amount: 0, paid: 100, balances: "方案：剩餘 3 堂" }], filters, "全部收費方式", ["count", "sessions", "amount", "paid"]);
    expect(csv).toContain('"\'=HYPERLINK(""bad"")\n王"');
    expect(csv).toContain('"\'+886900000000"');
    expect(csv).toContain('"消耗次數 0～不限"');
    expect(csv).toContain("目前方案餘額（非期間末餘額）");
    expect(csv).toContain('"姓名","電話","所屬店長"');
    expect(csv).toContain('"林店長"');
    expect(csv).not.toContain("消耗點數");
  });
  it("offers the backend guide at the new entrance and respects its data permissions", () => {
    const access = { module: "course" as const, permissions: ["customer.read", "booking.read", "wallet.read", "transaction.read"], features: { customer_care: true } };
    expect(findOperationGuides("消耗 最少", access).map(guide => guide.id)).toContain("CG01");
    expect(relatedOperationGuides("/s/test/admin/dashboard/growth/consumption", access).map(guide => guide.id)).toContain("CG01");
    expect(findOperationGuides("消耗 最少", { ...access, permissions: ["customer.read"] }).map(guide => guide.id)).not.toContain("CG01");
  });
});
