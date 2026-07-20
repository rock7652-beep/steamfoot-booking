import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("pending self-purchase partial unique index contract", () => {
  const initialSql = readFileSync(
    resolve(process.cwd(), "prisma/migrations/20260720090000_pending_payment_entitlement_snapshots/migration.sql"),
    "utf8",
  );
  const followupSql = readFileSync(
    resolve(process.cwd(), "prisma/migrations/20260720091000_replace_pending_validity_with_expiry_snapshot/migration.sql"),
    "utf8",
  );

  it("keeps the already-applied initial migration immutable", () => {
    expect(initialSql).toContain('ADD COLUMN "planSessionCountSnapshot" INTEGER');
    expect(initialSql).toContain('ADD COLUMN "planValidityDaysSnapshot" INTEGER');
    expect(initialSql).not.toContain('pendingWalletExpiryDateSnapshot');
  });

  it("uses a follow-up migration to replace the deprecated validity snapshot", () => {
    expect(followupSql).toContain('ADD COLUMN "pendingWalletExpiryDateSnapshot" DATE');
    expect(followupSql).toContain('DROP COLUMN "planValidityDaysSnapshot"');
    expect(followupSql).not.toContain('CREATE UNIQUE INDEX');
  });

  it("keys by store, customer, and plan while limiting only active self-service pending purchases", () => {
    expect(initialSql).toContain('ON "Transaction" ("storeId", "customerId", "planId")');
    expect(initialSql).toContain('"paymentStatus" = \'PENDING\'');
    expect(initialSql).toContain('"status" = \'SUCCESS\'');
    expect(initialSql).toContain('"paymentMethod" = \'TRANSFER\'');
    expect(initialSql).toContain('"soldByStaffId" IS NULL');
    expect(initialSql).toContain('"customerPlanWalletId" IS NULL');
  });

  it("does not include CANCELLED rows and therefore permits a later application", () => {
    const predicate = initialSql.split("WHERE", 2)[1] ?? "";
    expect(predicate).not.toContain("CANCELLED");
    expect(predicate).toContain('"status" = \'SUCCESS\'');
  });
});
