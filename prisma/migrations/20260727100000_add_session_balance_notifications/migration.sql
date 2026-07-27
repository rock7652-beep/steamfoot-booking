CREATE TYPE "SessionBalanceNotificationType" AS ENUM ('LAST_SESSION', 'PLAN_USED_UP');

CREATE TABLE "SessionBalanceNotification" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "SessionBalanceNotificationType" NOT NULL,
    "status" "MessageLogStatus" NOT NULL DEFAULT 'PENDING',
    "renderedBody" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionBalanceNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uniq_wallet_session_balance_notification"
ON "SessionBalanceNotification"("walletId", "type");

CREATE INDEX "SessionBalanceNotification_storeId_status_idx"
ON "SessionBalanceNotification"("storeId", "status");

CREATE INDEX "SessionBalanceNotification_customerId_idx"
ON "SessionBalanceNotification"("customerId");

ALTER TABLE "SessionBalanceNotification"
ADD CONSTRAINT "SessionBalanceNotification_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SessionBalanceNotification"
ADD CONSTRAINT "SessionBalanceNotification_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SessionBalanceNotification"
ADD CONSTRAINT "SessionBalanceNotification_walletId_fkey"
FOREIGN KEY ("walletId") REFERENCES "CustomerPlanWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
