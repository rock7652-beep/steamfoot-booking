-- Add per-store referral share template. NULL keeps the system default.
ALTER TABLE "ShopConfig"
ADD COLUMN "referralShareTemplate" TEXT;
