import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const healthPage = readFileSync(
  "src/app/(dashboard)/dashboard/health/page.tsx",
  "utf8",
);
const pageHeader = readFileSync(
  "src/components/desktop/page-header.tsx",
  "utf8",
);

describe("health dashboard responsive contract", () => {
  it("renders record cards on mobile and keeps the wide table on desktop", () => {
    expect(healthPage).toContain('className="grid gap-3 md:hidden"');
    expect(healthPage).toContain("<MobileMetric");
    expect(healthPage).toContain("查看完整數據");
    expect(healthPage).toContain("查看歷史曲線");
    expect(healthPage).toContain("/health`}");
    expect(healthPage).toContain("group-open:inline");
    expect(healthPage).toContain("md:block");
  });

  it("allows filter controls and page header actions to shrink on mobile", () => {
    expect(healthPage).toContain("更多篩選");
    expect(healthPage).toContain("open={hasAdvancedFilters}");
    expect(healthPage).toContain("w-full min-w-0 max-w-full");
    expect(healthPage).toContain("overflow-hidden rounded-md border");
    expect(healthPage).toContain("appearance-none border-0");
    expect(pageHeader).toContain("flex-col");
    expect(pageHeader).toContain("sm:flex-row");
  });
});
