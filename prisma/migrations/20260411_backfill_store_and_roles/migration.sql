-- ============================================================
-- Migration 2: Backfill store data + migrate roles
-- ============================================================

-- Step 1: Insert default store
INSERT INTO "Store" ("id", "name", "slug", "isDefault", "createdAt", "updatedAt")
VALUES ('default-store', '蒸足', 'default', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Step 2: Backfill storeId on all tables
UPDATE "Staff" SET "storeId" = 'default-store' WHERE "storeId" IS NULL;
UPDATE "Customer" SET "storeId" = 'default-store' WHERE "storeId" IS NULL;
UPDATE "Booking" SET "storeId" = 'default-store' WHERE "storeId" IS NULL;
UPDATE "Transaction" SET "storeId" = 'default-store' WHERE "storeId" IS NULL;
UPDATE "CustomerPlanWallet" SET "storeId" = 'default-store' WHERE "storeId" IS NULL;
UPDATE "CashbookEntry" SET "storeId" = 'default-store' WHERE "storeId" IS NULL;
UPDATE "DutyAssignment" SET "storeId" = 'default-store' WHERE "storeId" IS NULL;
UPDATE "ShopConfig" SET "storeId" = 'default-store' WHERE "storeId" IS NULL;

-- Step 3: Make storeId NOT NULL
ALTER TABLE "Staff" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Booking" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Transaction" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "CustomerPlanWallet" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "CashbookEntry" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "DutyAssignment" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "ShopConfig" ALTER COLUMN "storeId" SET NOT NULL;

-- Step 4: Add foreign keys
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerPlanWallet" ADD CONSTRAINT "CustomerPlanWallet_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashbookEntry" ADD CONSTRAINT "CashbookEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DutyAssignment" ADD CONSTRAINT "DutyAssignment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopConfig" ADD CONSTRAINT "ShopConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 5: Add indexes
CREATE INDEX "Staff_storeId_idx" ON "Staff"("storeId");
CREATE INDEX "Customer_storeId_idx" ON "Customer"("storeId");
CREATE INDEX "Booking_storeId_idx" ON "Booking"("storeId");
CREATE INDEX "Transaction_storeId_idx" ON "Transaction"("storeId");
CREATE INDEX "CustomerPlanWallet_storeId_idx" ON "CustomerPlanWallet"("storeId");
CREATE INDEX "CashbookEntry_storeId_idx" ON "CashbookEntry"("storeId");
CREATE INDEX "DutyAssignment_storeId_idx" ON "DutyAssignment"("storeId");
CREATE UNIQUE INDEX "ShopConfig_storeId_key" ON "ShopConfig"("storeId");

-- Step 6: Migrate UserRole values
UPDATE "User" SET role = 'ADMIN' WHERE role = 'OWNER';
UPDATE "User" SET role = 'COACH' WHERE role = 'BRANCH_MANAGER';
UPDATE "User" SET role = 'COACH' WHERE role = 'INTERN_MANAGER';
UPDATE "User" SET role = 'STORE_MANAGER' WHERE role = 'MANAGER';

-- Step 7: Migrate BookedByType values
UPDATE "Booking" SET "bookedByType" = 'ADMIN' WHERE "bookedByType" = 'OWNER';
