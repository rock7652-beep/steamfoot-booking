import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function readSource(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("data export entry", () => {
  const revenuePage = readSource("src/app/(dashboard)/dashboard/revenue/page.tsx");
  const exportPage = readSource("src/app/(dashboard)/dashboard/data-export/page.tsx");
  const sidebar = readSource("src/components/sidebar.tsx");

  it("shows the operation-page entry only to users with an export permission", () => {
    expect(revenuePage).toContain('checkPermission(user.role, user.staffId, "customer.export")');
    expect(revenuePage).toContain('checkPermission(user.role, user.staffId, "report.export")');
    expect(revenuePage).toContain("const canDataExport = canCustomerExport || canReportExport");
    expect(revenuePage).toContain('href="/dashboard/data-export"');
  });

  it("places the desktop entry in the page header and a touch-friendly mobile entry below it", () => {
    expect(revenuePage).toContain("actions={");
    expect(revenuePage).toContain("hidden rounded-md bg-primary-600");
    expect(revenuePage).toContain("md:inline-flex");
    expect(revenuePage).toContain("min-h-11");
    expect(revenuePage).toContain("md:hidden");
  });

  it("does not add data export to the sidebar", () => {
    expect(sidebar).not.toContain('label: "資料匯出"');
  });

  it("uses period shortcuts and Chinese status choices instead of free-form enum input", () => {
    const client = readSource("src/app/(dashboard)/dashboard/data-export/data-export-client.tsx");

    expect(client).toContain('useState<PeriodPreset>("thisMonth")');
    expect(client).toContain('thisMonth: "本月", lastMonth: "上月", custom: "自訂期間"');
    expect(client).toContain('periodPreset === "custom"');
    expect(client).toContain("DATA_EXPORT_STATUS_OPTIONS[type]");
    expect(client).toContain("全部狀態");
    expect(client).not.toContain('placeholder="例如 SUCCESS');
  });

  it("rejects direct access when the user has neither export permission", () => {
    expect(exportPage).toContain('checkPermission(user.role, user.staffId, "customer.export")');
    expect(exportPage).toContain('checkPermission(user.role, user.staffId, "report.export")');
    expect(exportPage).toContain('if (!user || (!canCustomerExport && !canReportExport)) redirect("/dashboard")');
  });
});
