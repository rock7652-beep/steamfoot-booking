-- Candidate only; no new database role or connection. Shared rental writes use the existing shared rental client.
-- The dedicated Beauty client needs read access for calendar/slot collision checks.
BEGIN;
DO $$
DECLARE app_role text := current_setting('beauty_migration.app_role', true);
BEGIN
 IF app_role IS NULL OR app_role='' THEN RAISE EXCEPTION 'Set beauty_migration.app_role explicitly before applying this candidate'; END IF;
 IF to_regclass('public."CourseRental"') IS NULL THEN RAISE EXCEPTION 'Install the existing shared rental schema first'; END IF;
 EXECUTE format('GRANT SELECT ON TABLE public."CourseRental" TO %I',app_role);
END $$;
COMMIT;
