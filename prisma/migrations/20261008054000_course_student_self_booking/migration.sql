-- Additive only. Existing stores keep student self-booking enabled.
-- Apply through the reviewed release workflow; never run from a UI request.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public."CourseBookingRule"
  ADD COLUMN "selfBookingEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "selfBookingRevision" INTEGER NOT NULL DEFAULT 0;
COMMIT;
