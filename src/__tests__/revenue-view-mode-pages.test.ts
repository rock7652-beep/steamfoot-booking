import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function readSource(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("revenue child-store view mode pages", () => {
  it("scopes the revenue decision page to the viewed store", () => {
    const source = readSource("src/app/(dashboard)/dashboard/revenue/page.tsx");

    expect(source).toContain("resolveStoreViewContextFromCookie(user)");
    expect(source).toContain(
      "const revenueStoreId = storeIdForViewContext(activeStoreId, storeViewContext)",
    );
    expect(source.match(/activeStoreId: revenueStoreId/g)?.length).toBe(3);
    expect(source).toContain("目前正在檢視分店營收，資料與明細皆為唯讀");
    expect(source).toContain("...(!isViewMode");
    expect(source).toContain('href: "/dashboard/reconciliation"');
  });

  it("scopes transaction records and disables write actions in view mode", () => {
    const source = readSource("src/app/(dashboard)/dashboard/transactions/page.tsx");

    expect(source).toContain("resolveStoreViewContextFromCookie(user)");
    expect(source).toContain(
      "const transactionsStoreId = storeIdForViewContext(activeStoreId, storeViewContext)",
    );
    expect(source).toContain("activeStoreId: transactionsStoreId");
    expect(source).toContain("listStaffSelectOptions(transactionsStoreId)");
    expect(source).toContain("getCachedStorePlan(transactionsStoreId ?? user.storeId ?? undefined)");
    expect(source.match(/isViewMode\s*\? Promise\.resolve\(false\)/g)?.length).toBe(3);
    expect(source).toContain("此頁為唯讀，無法修改、作廢或退款");
  });

  it("locks reconciliation before loading mother-store reconciliation data", () => {
    const source = readSource("src/app/(dashboard)/dashboard/reconciliation/page.tsx");
    const viewModeGuard = source.indexOf("if (storeViewContext?.isViewMode)");
    const reconciliationRead = source.indexOf("listReconciliationRuns(20)");

    expect(viewModeGuard).toBeGreaterThan(-1);
    expect(reconciliationRead).toBeGreaterThan(viewModeGuard);
    expect(source).toContain("分店檢視模式不提供對帳");
    expect(source).toContain("請先切回母店後再執行");
  });
});
