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

  it("rejects direct access when the user has neither export permission", () => {
    expect(exportPage).toContain('checkPermission(user.role, user.staffId, "customer.export")');
    expect(exportPage).toContain('checkPermission(user.role, user.staffId, "report.export")');
    expect(exportPage).toContain('if (!user || (!canCustomerExport && !canReportExport)) redirect("/dashboard")');
  });
});
