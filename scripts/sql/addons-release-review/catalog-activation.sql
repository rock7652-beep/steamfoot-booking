-- REVIEW ONLY. Schema-only alternative to the old activation migration.
-- Does not replace an applied migration or mark migration history as applied.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_setting('addons_release.review_id',true) IS DISTINCT FROM 'addons-release-v1'
 OR current_setting('addons_release.expected_database',true) IS DISTINCT FROM current_database()
 THEN RAISE EXCEPTION 'Reviewed add-ons database marker required'; END IF;
 IF to_regclass('public."ServiceAddOnCatalog"') IS NULL THEN RAISE EXCEPTION 'ServiceAddOnCatalog baseline required'; END IF;
END $$;
ALTER TABLE public."ServiceAddOnCatalog" ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT false;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name='ServiceAddOnCatalog' AND column_name='enabled' AND data_type='boolean' AND is_nullable='NO' AND column_default='false')
 THEN RAISE EXCEPTION 'Catalog activation schema drift; review before proceeding'; END IF;
END $$;
COMMIT;
