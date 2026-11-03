-- Additive only: preserve every legacy booking, payment and existing switch.
ALTER TABLE "CourseBookingRule" ADD COLUMN IF NOT EXISTS "assignedSchedulingEnabled" BOOLEAN NOT NULL DEFAULT true;
