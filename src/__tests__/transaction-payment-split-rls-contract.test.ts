import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const migrationPath =
  "prisma/migrations/20260808090000_enable_transaction_payment_split_rls/migration.sql";

describe("TransactionPaymentSplit RLS contract", () => {
  it("enables server-only RLS without exposing payment data to Data API roles", () => {
    const migration = read(migrationPath);

    expect(migration).toContain(
      'ALTER TABLE "TransactionPaymentSplit" ENABLE ROW LEVEL SECURITY',
    );
    expect(migration).not.toMatch(/CREATE\s+POLICY/i);
    expect(migration).not.toMatch(/GRANT\s+/i);
    expect(migration).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(migration).not.toMatch(/FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(migration).not.toMatch(/auth\.(uid|jwt|role)/i);
  });

  it("keeps store isolation on the parent transaction for every mixed-payment write", () => {
    for (const path of [
      "src/server/actions/single-booking.ts",
      "src/server/actions/trial-booking.ts",
      "src/server/actions/wallet.ts",
    ]) {
      const source = read(path);
      expect(source).toContain("const storeId = currentStoreId(user)");
      expect(source).toContain("paymentSplitCreateData(paymentSplits)");
      expect(source).toContain("storeId,");
    }
  });

  it("keeps store and headquarters report paths scoped before reading splits", () => {
    const storeRoute = read("src/app/api/reports/store-revenue/route.ts");
    const exportRoute = read("src/app/api/reports/export/route.ts");
    const reportQueries = read("src/lib/report-queries.ts");

    for (const route of [storeRoute, exportRoute]) {
      expect(route).toContain("getStoreFilter(readUser, reportsStoreId)");
      expect(route).toContain("storeFilter,");
    }
    expect(reportQueries).toContain("...filters.storeFilter");
    expect(reportQueries).toContain("prisma.transactionPaymentSplit.groupBy");
    expect(reportQueries).toContain("where: { transaction: active }");
  });

  it("keeps transaction export store-scoped and reads splits through the parent", () => {
    const source = read("src/app/api/data-export/route.ts");

    expect(source).toContain("const storeFilter = getStoreFilter(readUser, requestedStoreId)");
    expect(source).toContain("where: { ...storeFilter, ...revenueFilter");
    expect(source).toContain(
      "paymentSplits: { select: { paymentMethod: true, amount: true } }",
    );
  });
});
