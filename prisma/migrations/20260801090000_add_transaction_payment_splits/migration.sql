-- Additive and backward-compatible: existing transactions continue to use
-- Transaction.paymentMethod; no historical data is changed or backfilled.
CREATE TABLE "TransactionPaymentSplit" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "amount" DECIMAL(10,0) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransactionPaymentSplit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransactionPaymentSplit_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TransactionPaymentSplit_transactionId_idx" ON "TransactionPaymentSplit"("transactionId");
CREATE INDEX "TransactionPaymentSplit_paymentMethod_idx" ON "TransactionPaymentSplit"("paymentMethod");
