-- Additive schema for the authorized music Preview only.
-- Existing sessions retain their existing public-template booking behavior.
ALTER TABLE public."CourseSession"
  ADD COLUMN "bookingAudience" text NOT NULL DEFAULT 'OPEN';
ALTER TABLE public."CourseSession"
  ADD CONSTRAINT "CourseSession_bookingAudience_check"
  CHECK ("bookingAudience" IN ('OPEN', 'ASSIGNED'));
