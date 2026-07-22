import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("central member health HQ boundary", () => {
  it("guards the page with the non-delegable ADMIN role", () => {
    const page = source("src/app/(dashboard)/dashboard/member-link-reviews/page.tsx");

    expect(page).toContain('user.role !== "ADMIN"');
    expect(page).toContain("notFound()");
    expect(page).not.toContain('checkPermission(user.role, user.staffId, "customer.identity.rebind")');
  });

  it("only queries and displays the dashboard reminder for ADMIN", () => {
    const dashboard = source("src/app/(dashboard)/dashboard/page.tsx");

    expect(dashboard).toContain('user.role === "ADMIN" && dashboardStoreId');
  });

  it("keeps a fixed entry in HQ navigation and no entry in store navigation", () => {
    const sidebar = source("src/components/sidebar.tsx");
    const storeNav = sidebar.slice(
      sidebar.indexOf("export const STORE_ADMIN_NAV"),
      sidebar.indexOf("export const NAV_GROUPS"),
    );
    const hqNav = sidebar.slice(sidebar.indexOf("export const NAV_GROUPS"));

    expect(storeNav).not.toContain('/dashboard/member-link-reviews');
    expect(hqNav).toContain('/dashboard/member-link-reviews');
    expect(hqNav).toContain('label: "會員資料健康檢查"');
  });
});
