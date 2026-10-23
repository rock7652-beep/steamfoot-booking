-- Additive candidate only. No historical backfill; no LINE setting or delivery changes.
BEGIN;
ALTER TABLE public."BeautySetting" ADD COLUMN IF NOT EXISTS "backendNoticesEnabled" boolean NOT NULL DEFAULT true;
DO $$
DECLARE app_role text:=current_setting('beauty_migration.app_role',true);
BEGIN
 IF app_role IS NULL OR app_role='' THEN RAISE EXCEPTION 'Set beauty_migration.app_role explicitly'; END IF;
 IF to_regclass('public."CourseStoreNotice"') IS NULL THEN RAISE EXCEPTION 'Existing shared store notice schema required'; END IF;
 EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public."CourseStoreNotice" TO %I',app_role);
END $$;
COMMIT;
