-- HF-BRIDGE-PR-3A: durable idempotency / replay protection for HealthFlow callbacks
--
-- Additive only:
--   - records validated callback consumption
--   - unique idempotency key for safe retry handling
--   - unique signed-state jti for replay prevention
--
-- This migration does not update Customer.healthProfileId / healthLinkStatus.

-- CreateTable
CREATE TABLE "HealthflowLinkCallback" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "stateJti" TEXT NOT NULL,
  "callbackTimestamp" TIMESTAMP(3) NOT NULL,
  "profileId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'accepted',
  "requestHash" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HealthflowLinkCallback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthflowLinkCallback_idempotencyKey_key" ON "HealthflowLinkCallback"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "HealthflowLinkCallback_stateJti_key" ON "HealthflowLinkCallback"("stateJti");

-- CreateIndex
CREATE INDEX "HealthflowLinkCallback_customerId_idx" ON "HealthflowLinkCallback"("customerId");

-- CreateIndex
CREATE INDEX "HealthflowLinkCallback_storeId_idx" ON "HealthflowLinkCallback"("storeId");

-- CreateIndex
CREATE INDEX "HealthflowLinkCallback_profileId_idx" ON "HealthflowLinkCallback"("profileId");

-- CreateIndex
CREATE INDEX "HealthflowLinkCallback_createdAt_idx" ON "HealthflowLinkCallback"("createdAt");
