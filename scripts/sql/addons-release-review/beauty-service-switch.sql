-- REVIEW ONLY. Schema first; never enables a store or grants permission.
-- Requires explicitly reviewed target; not wired into a build or migration runner.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_setting('addons_release.review_id',true) IS DISTINCT FROM 'addons-release-v1'
 OR current_setting('addons_release.expected_database',true) IS DISTINCT FROM current_database()
 THEN RAISE EXCEPTION 'Reviewed add-ons database marker required'; END IF;
 IF to_regclass('public."BeautySetting"') IS NULL THEN RAISE EXCEPTION 'BeautySetting baseline required'; END IF;
END $$;
ALTER TABLE public."BeautySetting" ADD COLUMN IF NOT EXISTS "serviceAddOnsEnabled" BOOLEAN NOT NULL DEFAULT false;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name='BeautySetting' AND column_name='serviceAddOnsEnabled' AND data_type='boolean' AND is_nullable='NO' AND column_default='false')
 THEN RAISE EXCEPTION 'Beauty service switch schema drift; review before proceeding'; END IF;
END $$;
COMMIT;
