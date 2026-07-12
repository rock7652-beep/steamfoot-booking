import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("operations and analysis naming", () => {
  it("uses 營運 and 分析 in navigation", () => {
    const sidebar = source("src/components/sidebar.tsx");
    expect(sidebar).toContain('label: "營運"');
    expect(sidebar).toContain('label: "分析"');
  });

  it("uses the new report page titles", () => {
    expect(source("src/app/(dashboard)/dashboard/reports/page.tsx")).toContain(
      'title="營運分析"',
    );
    expect(source("src/app/(dashboard)/dashboard/advanced-reports/page.tsx")).toContain(
      'title="經營診斷"',
    );
  });

  it("uses the new names in breadcrumbs and mobile header", () => {
    const breadcrumb = source("src/components/breadcrumb.tsx");
    expect(breadcrumb).toContain('"營運分析"');
    expect(breadcrumb).toContain('"經營診斷"');
  });

  it("uses the new names in HQ features and plan surfaces", () => {
    const surfaces = [
      "src/lib/store-feature-catalog.ts",
      "src/app/(dashboard)/dashboard/settings/plan/page.tsx",
      "src/app/(dashboard)/dashboard/settings/plans/page.tsx",
      "src/app/pricing/page.tsx",
    ].map(source).join("\n");
    expect(surfaces).toContain("營運分析");
    expect(surfaces).toContain("經營診斷");
    expect(surfaces).not.toMatch(/基本報表|進階報表|成長版/);
  });
});
