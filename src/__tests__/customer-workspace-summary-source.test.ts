import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  "src/app/(dashboard)/dashboard/page.tsx",
  "utf8",
);

describe("dashboard customer workspace summary data sources", () => {
  it("reuses the same existing queries as the customer workspace", () => {
    expect(pageSource).toContain("getCustomerCareSummary(dashboardUser, dashboardStoreId)");
    expect(pageSource).toContain(
      "getBirthdayCustomersForMonth(dashboardStoreId, workspaceMonth)",
    );
    expect(pageSource).toContain(
      "getMonthlyUnconvertedCustomers(dashboardStoreId, workspaceMonth)",
    );
  });

  it("does not add an all-store aggregation or direct Prisma query for the workspace card", () => {
    expect(pageSource).not.toContain("getAllStoreCustomerWorkspaceSummary");
    expect(pageSource).toContain("const dashboardStoreId = isViewMode");
  });
});
