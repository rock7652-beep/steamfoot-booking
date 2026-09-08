import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(__dirname, "../../prisma/migrations/20260903120000_backfill_spa_payments/migration.sql"),
  "utf8",
);

describe("SPA payment cutover migration", () => {
  it("only backfills the isolated SPA demo store", () => {
    expect(migration).toContain(`s."industryModule" = 'SPA'`);
    expect(migration.match(/"storeId" = 'demo-store'/g)).toHaveLength(2);
    expect(migration).toContain('JOIN "SpaBooking"');
  });

  it("preserves individual and grouped payments without duplicating retries", () => {
    expect(migration).toContain("checkout=GROUP");
    expect(migration).toContain('PARTITION BY t."id"');
    expect(migration).toContain('ON CONFLICT ("id") DO UPDATE');
  });

  it("links positive refund rows back to their isolated original payment", () => {
    expect(migration).toContain('abs(coalesce(refund."netAmount", refund."amount", 0))');
    expect(migration).toContain('"refundOfPaymentId"');
    expect(migration).toContain(`'REFUNDED' ELSE 'SUCCESS'`);
  });

  it("maps legacy wallet settlements from immutable booking snapshots", () => {
    expect(migration).toContain("settlement=STORED_VALUE");
    expect(migration).toContain("settlement=PACKAGE");
    expect(migration).toContain(`THEN 'ENTITLEMENT'`);
  });
});
