-- Additive, backwards-compatible storage for multiple opening periods.
-- Existing rows remain NULL and continue to use openTime/closeTime/slotInterval.
ALTER TABLE "BusinessHours" ADD COLUMN "segments" JSONB;
ALTER TABLE "SpecialBusinessDay" ADD COLUMN "segments" JSONB;

ALTER TABLE "ShopConfig"
  ADD COLUMN "bookingOpensAt" TIMESTAMP(3),
  ADD COLUMN "bookingWindowDays" INTEGER NOT NULL DEFAULT 14;
