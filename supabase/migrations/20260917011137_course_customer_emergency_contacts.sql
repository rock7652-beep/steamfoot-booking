-- Additive optional contact fields; preserve all existing customer rows and identity links.
ALTER TABLE "Customer"
  ADD COLUMN "emergencyContactName" TEXT,
  ADD COLUMN "emergencyContactPhone" TEXT;
