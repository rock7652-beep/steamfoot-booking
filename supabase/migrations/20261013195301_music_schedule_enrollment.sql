-- Keep existing lessons open by default; only new assigned classes are closed to registration.
ALTER TABLE public."CourseSession" ADD COLUMN "enrollmentMode" TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE public."CourseSession" ADD COLUMN "enrollmentFingerprint" TEXT;
ALTER TABLE public."CourseSession" ADD CONSTRAINT "CourseSession_enrollmentMode_check" CHECK ("enrollmentMode" IN ('OPEN', 'ASSIGNED'));
ALTER TABLE public."CourseScheduleSeries" ADD COLUMN "enrollmentMode" TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE public."CourseScheduleSeries" ADD COLUMN "learnerSnapshot" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public."CourseScheduleSeries" ADD CONSTRAINT "CourseScheduleSeries_enrollmentMode_check" CHECK ("enrollmentMode" IN ('OPEN', 'ASSIGNED'));
ALTER TABLE public."CourseScheduleSeries" ADD CONSTRAINT "CourseScheduleSeries_learnerSnapshot_check" CHECK (jsonb_typeof("learnerSnapshot") = 'array');
-- No grants or RLS changes: these columns retain the tables' existing store access rules.
