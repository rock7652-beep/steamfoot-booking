ALTER TABLE "CoursePurchase"
  ADD COLUMN "listPrice" INTEGER,
  ADD COLUMN "discountKind" TEXT,
  ADD COLUMN "discountValue" DECIMAL(12,2),
  ADD COLUMN "paymentMethod" TEXT,
  ADD COLUMN "transferLastFour" TEXT;
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_checkout_valid" CHECK (
  "listPrice" IS NULL OR (
    "listPrice" >= 0 AND price >= 0 AND price <= "listPrice"
    AND "discountKind" IS NOT NULL AND "discountKind" IN ('AMOUNT','PERCENT')
    AND "discountValue" IS NOT NULL AND "discountValue" >= 0
    AND "paymentMethod" IS NOT NULL AND "paymentMethod" IN ('CASH','BANK_TRANSFER','CARD','OTHER','DISCOUNT')
    AND (price <> 0 OR "paymentMethod" = 'DISCOUNT')
    AND ("paymentMethod" <> 'BANK_TRANSFER' OR ("transferLastFour" IS NOT NULL AND "transferLastFour" ~ '^[0-9]{4}$'))
  )
);
