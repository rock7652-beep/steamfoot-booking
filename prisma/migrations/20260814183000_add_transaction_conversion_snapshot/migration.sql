-- Preserve the exact customer state changed by entitlement purchase flows.
ALTER TABLE "Transaction"
  ADD COLUMN "conversionEffectsApplied" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "firstTopupRewardsApplied" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "preConversionCustomerStage" "CustomerStage",
  ADD COLUMN "preConversionSelfBookingEnabled" BOOLEAN,
  ADD COLUMN "preConversionConvertedAt" TIMESTAMP(3);
