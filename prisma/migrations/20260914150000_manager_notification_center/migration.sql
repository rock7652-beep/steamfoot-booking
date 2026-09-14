ALTER TABLE "Store" ADD COLUMN "managerRecipientsMigrated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreLineNotificationRecipient" ADD COLUMN "preferences" JSONB NOT NULL DEFAULT '{}', ADD COLUMN "legacyStaffId" TEXT;
CREATE TABLE "ManagerNotificationLog" (
 "id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE CASCADE,
 "recipientId" TEXT NOT NULL, "recipientName" TEXT NOT NULL, "eventKey" TEXT NOT NULL,
 "type" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "renderedBody" TEXT NOT NULL,
 "errorMessage" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sentAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "ManagerNotificationLog_storeId_recipientId_eventKey_key" ON "ManagerNotificationLog"("storeId","recipientId","eventKey");
CREATE INDEX "ManagerNotificationLog_storeId_createdAt_idx" ON "ManagerNotificationLog"("storeId","createdAt");
ALTER TABLE "ManagerNotificationLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ManagerNotificationLog" FROM anon, authenticated;
