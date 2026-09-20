-- Additive only: existing bookings, balances and staff identities are preserved.
ALTER TABLE "CourseBooking" ADD COLUMN IF NOT EXISTS "checkedInAt" timestamptz(3);
ALTER TABLE "CourseBooking" ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE "CourseBooking" DROP CONSTRAINT IF EXISTS "CourseBooking_values";
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_values" CHECK ("pointCost" > 0 AND status IN ('RESERVED', 'CANCELLED', 'ATTENDED', 'NO_SHOW'));
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "emergencyContactName" text NOT NULL DEFAULT '';
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "emergencyContactPhone" text NOT NULL DEFAULT '';
