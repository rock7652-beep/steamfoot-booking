-- Add nullable per-store referral share template. Existing stores remain on the app fallback.
ALTER TABLE "ShopConfig" ADD COLUMN "referralShareTemplate" TEXT;
