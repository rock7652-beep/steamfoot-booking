import { describe, expect, it } from "vitest";
import { isVoidedTransaction, transactionStatusLabel } from "@/lib/transaction-display";

describe("transaction display state", () => {
  it.each([
    { status: "VOIDED", paymentStatus: "SUCCESS" },
    { status: "SUCCESS", paymentStatus: "CANCELLED" },
  ])("treats terminal cancelled transactions as voided", (transaction) => {
    expect(isVoidedTransaction(transaction)).toBe(true);
    expect(transactionStatusLabel(transaction)).toBe("已作廢");
  });

  it("leaves effective transactions unchanged", () => {
    const transaction = { status: "SUCCESS", paymentStatus: "SUCCESS" };

    expect(isVoidedTransaction(transaction)).toBe(false);
    expect(transactionStatusLabel(transaction)).toBeNull();
  });
});
