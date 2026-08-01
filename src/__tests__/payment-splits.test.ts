import { describe, expect, it } from "vitest";
import { createInitialPaymentSplits, isValidPaymentSplitSet, normalizePaymentSplits, paymentMethodReportAmount } from "@/lib/payment-splits";

describe("mixed payment validation", () => {
  it("accepts matching two-method totals and preserves one transaction's detail", () => {
    expect(normalizePaymentSplits([
      { paymentMethod: "CASH", amount: 2000 },
      { paymentMethod: "TRANSFER", amount: 3000 },
    ], 5000)).toEqual([
      { paymentMethod: "CASH", amount: 2000 },
      { paymentMethod: "TRANSFER", amount: 3000 },
    ]);
  });

  it("rejects totals that do not equal the real received amount", () => {
    expect(() => normalizePaymentSplits([
      { paymentMethod: "CASH", amount: 2000 },
      { paymentMethod: "TRANSFER", amount: 2999 },
    ], 5000)).toThrow(/必須等於實收總額/);
  });

  it("keeps legacy single payment requests unchanged", () => {
    expect(normalizePaymentSplits(undefined, 5000)).toBeNull();
  });

  it("resets safely when the total or primary payment method changes", () => {
    expect(createInitialPaymentSplits("TRANSFER", 6000)).toEqual([
      { paymentMethod: "TRANSFER", amount: 6000 },
      { paymentMethod: "CASH", amount: 0 },
    ]);
    expect(isValidPaymentSplitSet([
      { paymentMethod: "CASH", amount: 2000 },
      { paymentMethod: "TRANSFER", amount: 3000 },
      { paymentMethod: "LINE_PAY", amount: 1000 },
    ], 6000)).toBe(true);
    expect(isValidPaymentSplitSet(Array.from({ length: 6 }, (_, index) => ({ paymentMethod: "CASH" as const, amount: index + 1 })), 21)).toBe(false);
  });

  it("rejects duplicate-only or zero-value split rows", () => {
    expect(() => normalizePaymentSplits([
      { paymentMethod: "CASH", amount: 2000 },
      { paymentMethod: "CASH", amount: 3000 },
    ], 5000)).toThrow(/兩種不同/);
    expect(() => normalizePaymentSplits([
      { paymentMethod: "CASH", amount: 5000 },
      { paymentMethod: "TRANSFER", amount: 0 },
    ], 5000)).toThrow();
  });

  it("attributes a mixed transaction to each method once while legacy single payments keep their original amount", () => {
    const mixed = {
      paymentMethod: "CASH",
      amount: 5000,
      paymentSplits: [
        { paymentMethod: "CASH", amount: 2000 },
        { paymentMethod: "TRANSFER", amount: 3000 },
      ],
    };
    expect(paymentMethodReportAmount(mixed, "CASH")).toBe(2000);
    expect(paymentMethodReportAmount(mixed, "TRANSFER")).toBe(3000);
    expect(paymentMethodReportAmount(mixed, "CASH") + paymentMethodReportAmount(mixed, "TRANSFER")).toBe(5000);
    expect(paymentMethodReportAmount({ paymentMethod: "CASH", amount: 800, paymentSplits: [] }, "CASH")).toBe(800);
  });
});
