-- REVIEW DRAFT ONLY. Not in automatic migrations. No remote execution authorized.
-- Additive tables start empty: no historical identity claims or notification backfill.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE "ShopConfig" ADD COLUMN "workOrderReadyNotificationEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "InventoryOrder_storeId_id_key" ON "InventoryOrder" ("storeId", "id");
CREATE TABLE "StoreMemberConnection" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE RESTRICT,
  "customerId" TEXT NOT NULL,
  "identityProvider" TEXT NOT NULL,
  "lineUserId" TEXT NOT NULL,
  "channelKey" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "verificationCode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','APPROVED','REJECTED')),
  "centralUserId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "confirmedByUserId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("storeId", "customerId") REFERENCES "Customer"("storeId", "id") ON DELETE RESTRICT,
  CHECK ("status" <> 'APPROVED' OR ("centralUserId" IS NOT NULL AND "confirmedAt" IS NOT NULL)),
  UNIQUE ("storeId", "lineUserId"), UNIQUE ("storeId", "id")
);
CREATE INDEX "StoreMemberConnection_storeId_customerId_status_idx" ON "StoreMemberConnection"("storeId", "customerId", "status");
CREATE TABLE "WorkOrderReadyNotification" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE RESTRICT,
  "orderId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "connectionId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','SENT','FAILED','SKIPPED')),
  "retryKey" TEXT NOT NULL UNIQUE,
  "snapshot" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retryUntil" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("storeId", "orderId") REFERENCES "InventoryOrder"("storeId", "id") ON DELETE RESTRICT,
  FOREIGN KEY ("storeId", "customerId") REFERENCES "Customer"("storeId", "id") ON DELETE RESTRICT,
  FOREIGN KEY ("storeId", "connectionId") REFERENCES "StoreMemberConnection"("storeId", "id") ON DELETE RESTRICT,
  UNIQUE ("storeId", "orderId")
);
CREATE INDEX "WorkOrderReadyNotification_status_nextAttemptAt_idx" ON "WorkOrderReadyNotification"("status", "nextAttemptAt");
CREATE INDEX "WorkOrderReadyNotification_storeId_customerId_idx" ON "WorkOrderReadyNotification"("storeId", "customerId");
ALTER TABLE "StoreMemberConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkOrderReadyNotification" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "StoreMemberConnection", "WorkOrderReadyNotification" FROM PUBLIC, anon, authenticated;
COMMIT;
