import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customerPage = readFileSync("src/app/(customer)/health/page.tsx", "utf8");
const managerPage = readFileSync(
  "src/app/(dashboard)/dashboard/customers/[id]/health/page.tsx",
  "utf8",
);
const managerService = readFileSync(
  "src/server/services/customer-health-history-visibility.ts",
  "utf8",
);

describe("automatic manager cross-store health visibility contract", () => {
  it("removes customer consent controls and their server action", () => {
    expect(customerPage).not.toContain("跨店健康歷史授權");
    expect(customerPage).not.toContain("授權目前門市查看");
    expect(customerPage).not.toContain("撤回目前門市授權");
    expect(customerPage).not.toContain("healthConsent");
    expect(
      existsSync("src/server/actions/customer-health-history-grant.ts"),
    ).toBe(false);
  });

  it("limits automatic cross-store visibility to managers and verified memberships", () => {
    expect(managerService).toContain('new Set(["ADMIN", "OWNER", "PARTNER"])');
    expect(managerService).toContain("resolveCentralUserForStoreCustomer");
    expect(managerService).toContain("resolveCentralMembershipsForUser");
    expect(managerService).toContain("targetStillVerified");
    expect(managerService).not.toContain("CustomerHealthHistoryGrant");
    expect(managerPage).toContain("staffRole: user.role");
    expect(managerPage).toContain("店長可唯讀查看完整健康歷史");
  });
});
