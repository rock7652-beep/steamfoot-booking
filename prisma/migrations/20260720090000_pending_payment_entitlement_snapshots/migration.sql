-- Pending payment entitlement gate
-- Additive only: no production data is read, updated, or backfilled.
ALTER TABLE "Transaction"
  ADD COLUMN "planSessionCountSnapshot" INTEGER,
  ADD COLUMN "planValidityDaysSnapshot" INTEGER;

-- One unconfirmed self-service purchase per customer/store/plan.  Historical
-- pending transactions that already have a wallet and staff-created transfers
-- are deliberately outside this guard.
CREATE UNIQUE INDEX "Transaction_pending_self_purchase_per_plan_key"
  ON "Transaction" ("storeId", "customerId", "planId")
  WHERE "paymentStatus" = 'PENDING'
    AND "status" = 'SUCCESS'
    AND "paymentMethod" = 'TRANSFER'
    AND "soldByStaffId" IS NULL
    AND "customerPlanWalletId" IS NULL;
