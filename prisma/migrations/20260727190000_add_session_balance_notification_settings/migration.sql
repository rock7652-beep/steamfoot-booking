CREATE TABLE "SessionBalanceNotificationSetting" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSessionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "planUsedUpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSessionUnbookedTemplate" TEXT NOT NULL,
    "lastSessionBookedTemplate" TEXT NOT NULL,
    "planUsedUpTemplate" TEXT NOT NULL,
    "learnMoreButtonLabel" TEXT NOT NULL DEFAULT '了解適合我的方案',
    "laterButtonLabel" TEXT NOT NULL DEFAULT '之後再看看',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionBalanceNotificationSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionBalanceNotificationSetting_storeId_key"
ON "SessionBalanceNotificationSetting"("storeId");

ALTER TABLE "SessionBalanceNotificationSetting"
ADD CONSTRAINT "SessionBalanceNotificationSetting_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionBalanceNotificationSetting" ENABLE ROW LEVEL SECURITY;
