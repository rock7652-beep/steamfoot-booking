-- ============================================================
-- Migration 1: Add Store model + new role enum values
-- ============================================================
-- NOTE: ALTER TYPE ADD VALUE cannot run in a transaction.
-- This migration must run outside a transaction block.
-- Prisma handles this automatically for migrations with ADD VALUE.
-- ============================================================

-- Step 1: Add new enum values to UserRole
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COACH';

-- Step 2: Add ADMIN to BookedByType (replaces OWNER in booking context)
ALTER TYPE "BookedByType" ADD VALUE IF NOT EXISTS 'ADMIN';

-- Step 3: Create Store table
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

-- Step 4: Add nullable storeId columns to key tables
ALTER TABLE "Staff" ADD COLUMN "storeId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "storeId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "storeId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "storeId" TEXT;
ALTER TABLE "CustomerPlanWallet" ADD COLUMN "storeId" TEXT;
ALTER TABLE "CashbookEntry" ADD COLUMN "storeId" TEXT;
ALTER TABLE "DutyAssignment" ADD COLUMN "storeId" TEXT;
ALTER TABLE "ShopConfig" ADD COLUMN "storeId" TEXT;
