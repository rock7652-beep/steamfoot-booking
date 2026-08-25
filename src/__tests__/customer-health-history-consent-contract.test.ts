import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "prisma/migrations/20260825133000_add_customer_health_history_grants/migration.sql",
  "utf8",
);
const action = readFileSync(
  "src/server/actions/customer-health-history-grant.ts",
  "utf8",
);
const customerPage = readFileSync("src/app/(customer)/health/page.tsx", "utf8");

describe("customer cross-store health history consent contract", () => {
  it("keeps one active grant, preserves revoked cycles, and blocks public REST access", () => {
    expect(migration).toContain('WHERE "revokedAt" IS NULL');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).not.toMatch(/CREATE\s+POLICY/i);
    expect(migration).toContain('ON DELETE CASCADE');
  });

  it("authorizes only the current verified store membership and audits both transitions", () => {
    expect(action).toContain('session.role !== "CUSTOMER"');
    expect(action).toContain("resolveCentralMembershipsForUser(session.id)");
    expect(action).toContain("membership.storeId === store.storeId");
    expect(action).toContain("membership.customerId === resolvedCustomer.customer?.id");
    expect(action).toContain('action: "GRANT_HEALTH_HISTORY_ACCESS"');
    expect(action).toContain('action: "REVOKE_HEALTH_HISTORY_ACCESS"');
    expect(action).toContain('access: "READ_ONLY_CUSTOMER_DETAIL"');
  });

  it("lets the customer explicitly grant and revoke from their own health page", () => {
    expect(customerPage).toContain("grantCurrentStoreHealthHistoryAccess");
    expect(customerPage).toContain("revokeCurrentStoreHealthHistoryAccess");
    expect(customerPage).toContain("授權目前門市查看");
    expect(customerPage).toContain("撤回目前門市授權");
    expect(customerPage).toContain("不會出現在全店總覽");
  });
});
