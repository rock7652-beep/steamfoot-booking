-- CreateEnum
CREATE TYPE "PricingPlan" AS ENUM ('EXPERIENCE', 'BASIC', 'GROWTH', 'ALLIANCE');

-- AlterTable: Add plan + override columns to Store
ALTER TABLE "Store" ADD COLUMN "plan" "PricingPlan" NOT NULL DEFAULT 'EXPERIENCE';
ALTER TABLE "Store" ADD COLUMN "maxStaffOverride" INTEGER;
ALTER TABLE "Store" ADD COLUMN "maxCustomersOverride" INTEGER;
ALTER TABLE "Store" ADD COLUMN "maxMonthlyBookingsOverride" INTEGER;
ALTER TABLE "Store" ADD COLUMN "maxMonthlyReportsOverride" INTEGER;
ALTER TABLE "Store" ADD COLUMN "maxReminderSendsOverride" INTEGER;
ALTER TABLE "Store" ADD COLUMN "maxStoresOverride" INTEGER;

-- Set existing default store to ALLIANCE (avoid gate restrictions during dev/prod)
UPDATE "Store" SET "plan" = 'ALLIANCE' WHERE "isDefault" = true;
