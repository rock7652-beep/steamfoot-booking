-- Additive only. Legacy notifications remain version 0 and are not replayed.
ALTER TABLE "SessionBalanceNotification"
  ADD COLUMN "deliveryVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deliverySnapshot" JSONB,
  ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "leaseUntil" TIMESTAMP(3),
  ADD COLUMN "retryUntil" TIMESTAMP(3);

CREATE INDEX "SessionBalanceNotification_deliveryVersion_status_nextAttemptAt_idx"
  ON "SessionBalanceNotification"("deliveryVersion", "status", "nextAttemptAt");
