-- PR-1: staff-authorized LINE replacement identity capture.
-- No existing Customer, Account, CustomerIdentityLink, Booking, or ReminderLog
-- data is changed by this migration.

CREATE TYPE "LineRebindRequestStatus" AS ENUM (
  'PENDING_CAPTURE', 'CANDIDATE_CAPTURED', 'CANCELLED', 'EXPIRED', 'CONSUMED'
);

CREATE TABLE "LineRebindRequest" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "cancelledByUserId" TEXT,
  "reason" TEXT NOT NULL,
  "phoneHash" TEXT NOT NULL,
  "status" "LineRebindRequestStatus" NOT NULL DEFAULT 'PENDING_CAPTURE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "capturedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LineRebindRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LineRebindRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LineRebindRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LineRebindRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LineRebindRequest_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "LineRebindCandidate" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "webhookEventKey" TEXT NOT NULL,
  "userIdHash" TEXT NOT NULL,
  "ciphertext" BYTEA NOT NULL,
  "iv" BYTEA NOT NULL,
  "authTag" BYTEA NOT NULL,
  "keyVersion" TEXT NOT NULL,
  "eventTimestamp" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LineRebindCandidate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LineRebindCandidate_requestId_key" UNIQUE ("requestId"),
  CONSTRAINT "LineRebindCandidate_webhookEventKey_key" UNIQUE ("webhookEventKey"),
  CONSTRAINT "LineRebindCandidate_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "LineRebindRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "LineRebindRequest_storeId_customerId_status_expiresAt_idx"
  ON "LineRebindRequest"("storeId", "customerId", "status", "expiresAt");
CREATE INDEX "LineRebindRequest_expiresAt_idx" ON "LineRebindRequest"("expiresAt");
CREATE INDEX "LineRebindCandidate_expiresAt_idx" ON "LineRebindCandidate"("expiresAt");

-- Prisma 6.19.2 cannot express `where` partial indexes in schema. This is the
-- authoritative concurrency guard: at most one request remains active per
-- store/customer, regardless of concurrent create transactions.
CREATE UNIQUE INDEX "LineRebindRequest_one_active_per_customer"
  ON "LineRebindRequest"("storeId", "customerId")
  WHERE "status" IN ('PENDING_CAPTURE', 'CANDIDATE_CAPTURED');
