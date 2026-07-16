-- Booking submission idempotency core.
-- A submission represents one operation intent and intentionally has no direct
-- foreign key to Booking or to a future recurrence group. Results are replayed
-- from the versioned JSON snapshot.

CREATE TYPE "BookingSubmissionStatus" AS ENUM (
  'PROCESSING',
  'SUCCEEDED',
  'FAILED_RETRYABLE',
  'FAILED_FINAL'
);

CREATE TYPE "BookingSubmissionType" AS ENUM (
  'BOOKING_CREATE',
  'BOOKING_UPDATE',
  'BOOKING_CANCEL',
  'BOOKING_RECURRING'
);

CREATE TABLE "BookingSubmission" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "requestKey" VARCHAR(128) NOT NULL,
  "submissionType" "BookingSubmissionType" NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "status" "BookingSubmissionStatus" NOT NULL DEFAULT 'PROCESSING',
  "actorUserId" TEXT,
  "canonicalCustomerId" TEXT,
  "source" VARCHAR(32),
  "attemptToken" VARCHAR(64),
  "leaseExpiresAt" TIMESTAMP(3),
  "responseSnapshot" JSONB,
  "responseSchemaVersion" INTEGER NOT NULL DEFAULT 1,
  "errorCategory" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BookingSubmission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingSubmission_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BookingSubmission_storeId_requestKey_key"
  ON "BookingSubmission"("storeId", "requestKey");
CREATE INDEX "BookingSubmission_storeId_idx"
  ON "BookingSubmission"("storeId");
CREATE INDEX "BookingSubmission_status_leaseExpiresAt_idx"
  ON "BookingSubmission"("status", "leaseExpiresAt");
CREATE INDEX "BookingSubmission_expiresAt_idx"
  ON "BookingSubmission"("expiresAt");
CREATE INDEX "BookingSubmission_canonicalCustomerId_idx"
  ON "BookingSubmission"("canonicalCustomerId");
