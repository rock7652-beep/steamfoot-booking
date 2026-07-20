import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("pending self-purchase partial unique index contract", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "prisma/migrations/20260720090000_pending_payment_entitlement_snapshots/migration.sql"),
    "utf8",
  );

  it("keys by store, customer, and plan while limiting only active self-service pending purchases", () => {
    expect(sql).toContain('ON "Transaction" ("storeId", "customerId", "planId")');
    expect(sql).toContain('"paymentStatus" = \'PENDING\'');
    expect(sql).toContain('"status" = \'SUCCESS\'');
    expect(sql).toContain('"paymentMethod" = \'TRANSFER\'');
    expect(sql).toContain('"soldByStaffId" IS NULL');
    expect(sql).toContain('"customerPlanWalletId" IS NULL');
  });

  it("does not include CANCELLED rows and therefore permits a later application", () => {
    const predicate = sql.split("WHERE", 2)[1] ?? "";
    expect(predicate).not.toContain("CANCELLED");
    expect(predicate).toContain('"status" = \'SUCCESS\'');
  });
});
