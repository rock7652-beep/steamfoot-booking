CREATE TABLE "StoreLineNotificationRecipient" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "roleLabel" TEXT NOT NULL,
  "lineUserId" TEXT,
  "bindingCode" TEXT,
  "bindingCodeExpiresAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "linkedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreLineNotificationRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreLineNotificationRecipient_bindingCode_key"
  ON "StoreLineNotificationRecipient"("bindingCode");
CREATE UNIQUE INDEX "StoreLineNotificationRecipient_storeId_lineUserId_key"
  ON "StoreLineNotificationRecipient"("storeId", "lineUserId");
CREATE INDEX "StoreLineNotificationRecipient_storeId_isActive_idx"
  ON "StoreLineNotificationRecipient"("storeId", "isActive");
ALTER TABLE "StoreLineNotificationRecipient"
  ADD CONSTRAINT "StoreLineNotificationRecipient_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
