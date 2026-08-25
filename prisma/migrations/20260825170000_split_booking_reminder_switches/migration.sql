ALTER TABLE "ReminderRule"
  ADD COLUMN "packageBookingEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "trialBookingEnabled" BOOLEAN NOT NULL DEFAULT true;
