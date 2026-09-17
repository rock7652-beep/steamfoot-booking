-- Preview only until separately authorized for production.
ALTER TABLE "CoursePurchaseRefund" ADD COLUMN method text NOT NULL DEFAULT 'OTHER';
ALTER TABLE "CoursePurchaseRefund" ADD CONSTRAINT "CoursePurchaseRefund_method_check"
  CHECK (method IN ('CASH','BANK_TRANSFER','CARD','OTHER'));
ALTER TABLE "CoursePurchaseRefund" DROP CONSTRAINT "CoursePurchaseRefund_points_check";
ALTER TABLE "CoursePurchaseRefund" ADD CONSTRAINT "CoursePurchaseRefund_points_check" CHECK (points >= 0);
ALTER TABLE "CoursePurchaseRefund" DROP CONSTRAINT "CoursePurchaseRefund_purchaseId_key";
CREATE INDEX "CoursePurchaseRefund_purchaseId_idx" ON "CoursePurchaseRefund"("purchaseId");
