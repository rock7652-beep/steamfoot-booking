-- Isolated sports Preview database only. Never part of production migration discovery.
-- Reuse the reviewed music series structure in a separate table so music's cron cannot expand sports rows.
BEGIN;
CREATE TABLE IF NOT EXISTS public."SportsPreviewScheduleSeries" (LIKE public."CourseScheduleSeries" INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
ALTER TABLE public."SportsPreviewScheduleSeries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."SportsPreviewScheduleSeries" FROM anon, authenticated;
COMMIT;
