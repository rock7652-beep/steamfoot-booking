-- Follow-up for the already-applied pending-payment migration.
-- Production has not applied either migration yet; it will run both in order.
-- Preview has the first migration recorded, so this file is the only schema
-- change it needs. No transaction data is read or modified.
ALTER TABLE "Transaction"
  ADD COLUMN "pendingWalletExpiryDateSnapshot" DATE,
  DROP COLUMN "planValidityDaysSnapshot";
