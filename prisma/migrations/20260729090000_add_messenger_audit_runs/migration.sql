CREATE TYPE "MessengerAuditStatus" AS ENUM ('RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

CREATE TABLE "MessengerAuditRun" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "status" "MessengerAuditStatus" NOT NULL DEFAULT 'RUNNING',
  "appValidated" BOOLEAN,
  "pageTokenMatches" BOOLEAN,
  "callbackMatches" BOOLEAN,
  "configuredFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "missingFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "pageAttached" BOOLEAN,
  "callsSafeSummary" JSONB,
  "errorCode" TEXT,
  CONSTRAINT "MessengerAuditRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MessengerAuditRun_storeId_createdAt_idx" ON "MessengerAuditRun"("storeId", "createdAt");
CREATE INDEX "MessengerAuditRun_requestedByUserId_createdAt_idx" ON "MessengerAuditRun"("requestedByUserId", "createdAt");

ALTER TABLE "MessengerAuditRun"
  ADD CONSTRAINT "MessengerAuditRun_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessengerAuditRun"
  ADD CONSTRAINT "MessengerAuditRun_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
