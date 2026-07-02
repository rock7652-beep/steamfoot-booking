-- CreateEnum
CREATE TYPE "StoreFeatureEntitlementStatus" AS ENUM ('ENABLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "StoreFeatureEntitlementSource" AS ENUM ('ADDON', 'MANUAL', 'PROMO', 'HQ_OVERRIDE');

-- CreateTable
CREATE TABLE "StoreFeatureEntitlement" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "status" "StoreFeatureEntitlementStatus" NOT NULL DEFAULT 'ENABLED',
    "source" "StoreFeatureEntitlementSource" NOT NULL DEFAULT 'MANUAL',
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "note" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreFeatureEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_store_feature_entitlement" ON "StoreFeatureEntitlement"("storeId", "featureKey");

-- CreateIndex
CREATE INDEX "StoreFeatureEntitlement_storeId_idx" ON "StoreFeatureEntitlement"("storeId");

-- CreateIndex
CREATE INDEX "StoreFeatureEntitlement_featureKey_idx" ON "StoreFeatureEntitlement"("featureKey");

-- CreateIndex
CREATE INDEX "StoreFeatureEntitlement_status_idx" ON "StoreFeatureEntitlement"("status");

-- CreateIndex
CREATE INDEX "StoreFeatureEntitlement_expiresAt_idx" ON "StoreFeatureEntitlement"("expiresAt");

-- AddForeignKey
ALTER TABLE "StoreFeatureEntitlement" ADD CONSTRAINT "StoreFeatureEntitlement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
