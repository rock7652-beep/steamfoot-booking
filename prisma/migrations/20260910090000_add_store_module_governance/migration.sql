-- HQ module governance. This migration is additive and backfills every existing
-- store as an active Steamfoot installation, preserving current production behavior.
CREATE TYPE "IndustryModule" AS ENUM ('STEAMFOOT', 'SPA');
CREATE TYPE "StoreModuleInstallationStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'FAILED');

ALTER TABLE "Store"
  ADD COLUMN "industryModule" "IndustryModule" NOT NULL DEFAULT 'STEAMFOOT';

CREATE INDEX "Store_industryModule_idx" ON "Store"("industryModule");

CREATE TABLE "StoreModuleInstallation" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "module" "IndustryModule" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "StoreModuleInstallationStatus" NOT NULL DEFAULT 'PROVISIONING',
  "failureCode" TEXT,
  "failureDetail" TEXT,
  "provisionedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreModuleInstallation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoreModuleInstallation_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StoreModuleInstallation_storeId_key" ON "StoreModuleInstallation"("storeId");
CREATE INDEX "StoreModuleInstallation_module_status_idx" ON "StoreModuleInstallation"("module", "status");

INSERT INTO "StoreModuleInstallation" (
  "id", "storeId", "module", "version", "status", "provisionedAt", "updatedAt"
)
SELECT
  'store-module-' || "id", "id", 'STEAMFOOT', 1, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Store";
