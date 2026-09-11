ALTER TABLE "BookingRecurrenceGroup"
ADD COLUMN "confirmationNotificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "confirmationNotificationClaimedAt" TIMESTAMP(3),
ADD COLUMN "confirmationNotificationSentAt" TIMESTAMP(3),
ADD COLUMN "confirmationNotificationError" TEXT;
