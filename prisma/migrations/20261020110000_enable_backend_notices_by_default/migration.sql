BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public."CourseBookingRule"
 ALTER COLUMN "backendNoticesEnabled" SET DEFAULT true;

-- One-time enablement for every existing store; later opt-outs remain supported.
UPDATE public."CourseBookingRule"
 SET "backendNoticesEnabled" = true
 WHERE "backendNoticesEnabled" = false;

COMMIT;
