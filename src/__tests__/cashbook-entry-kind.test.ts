import { describe, expect, it } from "vitest";
import { cashbookCategoryForKind, isRetailCashbookCategory } from "@/lib/cashbook-entry-kind";

describe("manual cashbook revenue classification", () => {
  it("keeps retail in retail analysis regardless of whether a customer was selected", () => {
    const category = cashbookCategoryForKind("RETAIL", "精油");
    expect(category).toBe("零售-精油");
    expect(isRetailCashbookCategory(category)).toBe(true);
  });

  it("keeps explicit other income in other analysis even with a legacy retail prefix in the item", () => {
    const category = cashbookCategoryForKind("OTHER", "零售-服務費");
    expect(isRetailCashbookCategory(category)).toBe(false);
    expect(cashbookCategoryForKind("OTHER", "")).toBe("其他收入");
  });

  it("recognizes old cashbook entries without changing their stored category", () => {
    expect(isRetailCashbookCategory("零售-A計畫")).toBe(true);
    expect(isRetailCashbookCategory("單次服務")).toBe(false);
    expect(isRetailCashbookCategory(null)).toBe(false);
  });
});
