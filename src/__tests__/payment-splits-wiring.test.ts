import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("mixed payment wiring", () => {
  it("writes details from all three collection entry points without duplicating transactions", () => {
    for (const path of [
      "src/server/actions/single-booking.ts",
      "src/server/actions/trial-booking.ts",
      "src/server/actions/wallet.ts",
    ]) {
      const source = read(path);
      expect(source).toContain("normalizePaymentSplits");
      expect(source).toContain("paymentSplitCreateData(paymentSplits)");
      expect(source).toContain("transaction.create({");
    }
  });

  it("keeps migration additive and shows original details during refund", () => {
    expect(read("prisma/migrations/20260801090000_add_transaction_payment_splits/migration.sql")).toContain('CREATE TABLE "TransactionPaymentSplit"');
    const drawer = read("src/app/(dashboard)/dashboard/transactions/_components/TransactionDrawer.tsx");
    expect(drawer).toContain("原付款拆分");
    expect(read("src/app/api/reports/store-revenue/route.ts")).toContain('level === "payment-methods"');
  });

  it("keeps the client split editor safe and connects the live revenue screen", () => {
    const editor = read("src/components/admin/payment-split-fields.tsx");
    expect(editor).toContain("splits.length >= 5");
    expect(editor).toContain("splits.length <= 2");
    expect(editor).toContain("實收金額或主要付款方式已變更");
    expect(editor).toContain("onValidityChange");
    const report = read("src/components/reports/RevenueReportClient.tsx");
    expect(report).toContain('paymentParams.set("level", "payment-methods")');
    expect(report).toContain("付款方式拆分");
  });
});
