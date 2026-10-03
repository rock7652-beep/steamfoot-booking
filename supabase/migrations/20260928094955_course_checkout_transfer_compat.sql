-- Manager checkout stores bank digits in transferLastFour; legacy portal
-- submissions still require four/five digits in transferLastFive.
-- CoursePurchase_checkout_valid continues to validate payment method and
-- mandatory four digits for BANK_TRANSFER. Do not fabricate legacy digits.
ALTER TABLE public."CoursePurchase"
  DROP CONSTRAINT "CoursePurchase_transferLastFive_check",
  ADD CONSTRAINT "CoursePurchase_transferLastFive_check" CHECK (
    "transferLastFive" ~ '^[0-9]{4,5}$'
    OR (
      "transferLastFive" = ''
      AND "listPrice" IS NOT NULL
      AND "paymentMethod" IS NOT NULL
    )
  );
