-- PR-B: durable, one-time LINE OAuth state / nonce coordinator.
-- Raw state and nonce are intentionally never persisted.
CREATE TYPE "LineOAuthAttemptStatus" AS ENUM ('PENDING', 'CONSUMED', 'EXPIRED');

-- A Customer can legitimately hold Google and LINE links simultaneously.
DROP INDEX "CustomerIdentityLink_customerId_key";
CREATE UNIQUE INDEX "CustomerIdentityLink_customerId_provider_key"
  ON "CustomerIdentityLink"("customerId", "provider");
DROP INDEX "uq_customer_identity_user_store";
CREATE UNIQUE INDEX "uq_customer_identity_user_store_provider"
  ON "CustomerIdentityLink"("userId", "storeId", "provider");

CREATE TABLE "LineOAuthAttempt" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeSlug" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "status" "LineOAuthAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineOAuthAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LineOAuthAttempt_stateHash_key" ON "LineOAuthAttempt"("stateHash");
CREATE UNIQUE INDEX "LineOAuthAttempt_storeId_nonceHash_key" ON "LineOAuthAttempt"("storeId", "nonceHash");
CREATE INDEX "LineOAuthAttempt_storeId_status_expiresAt_idx" ON "LineOAuthAttempt"("storeId", "status", "expiresAt");
CREATE INDEX "LineOAuthAttempt_expiresAt_idx" ON "LineOAuthAttempt"("expiresAt");

ALTER TABLE "LineOAuthAttempt"
  ADD CONSTRAINT "LineOAuthAttempt_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
