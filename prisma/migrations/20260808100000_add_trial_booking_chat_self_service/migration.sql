-- Additive only: existing bookings retain their current lifecycle and payment
-- behaviour. Chat identities are encrypted; no raw LINE user ID or PSID is
-- persisted by this feature outside the existing identity integrations.
CREATE TYPE "TrialBookingChannel" AS ENUM ('LINE', 'MESSENGER');
ALTER TYPE "ReminderChannel" ADD VALUE IF NOT EXISTS 'MESSENGER';

ALTER TABLE "Booking"
  ADD COLUMN "trialBookingChannel" "TrialBookingChannel",
  ADD COLUMN "customerConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "customerRescheduledAt" TIMESTAMP(3),
  ADD COLUMN "customerCancelledAt" TIMESTAMP(3),
  ADD COLUMN "customerCancelledSource" TEXT,
  ADD COLUMN "customerRescheduleCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "originalBookingDate" DATE,
  ADD COLUMN "originalSlotTime" TEXT;

CREATE TABLE "TrialBookingLink" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "channel" "TrialBookingChannel" NOT NULL,
  "identityHash" TEXT NOT NULL,
  "identityCiphertext" BYTEA NOT NULL,
  "identityIv" BYTEA NOT NULL,
  "identityAuthTag" BYTEA NOT NULL,
  "identityKeyVersion" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "bookingId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrialBookingLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrialBookingLink_tokenHash_key" ON "TrialBookingLink"("tokenHash");
CREATE UNIQUE INDEX "TrialBookingLink_bookingId_key" ON "TrialBookingLink"("bookingId");
CREATE INDEX "TrialBookingLink_storeId_expiresAt_idx" ON "TrialBookingLink"("storeId", "expiresAt");
CREATE INDEX "TrialBookingLink_bookingId_idx" ON "TrialBookingLink"("bookingId");
ALTER TABLE "TrialBookingLink" ADD CONSTRAINT "TrialBookingLink_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrialBookingLink" ADD CONSTRAINT "TrialBookingLink_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrialBookingLink" ENABLE ROW LEVEL SECURITY;
