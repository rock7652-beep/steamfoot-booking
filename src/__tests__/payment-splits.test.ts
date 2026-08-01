import { describe, expect, it } from "vitest";
import { normalizePaymentSplits } from "@/lib/payment-splits";

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
});
