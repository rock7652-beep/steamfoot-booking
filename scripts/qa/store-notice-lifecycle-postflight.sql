-- Read-only phase-one schema and effective privilege report. No deletion capability.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
WITH required_tables(name) AS (VALUES ('SteamfootStoreNotice'),('CourseStoreNotice'),('DigitalManagerNotice')),
columns_ok AS (
 SELECT count(*)=12 AND bool_and(
  CASE WHEN a.attname='publishedAt' THEN a.atttypid='timestamptz'::regtype AND a.atttypmod=3 AND a.attnotnull
       WHEN a.attname='readAt' THEN a.atttypid='timestamptz'::regtype AND a.atttypmod=3 AND NOT a.attnotnull
       ELSE a.atttypid='text'::regtype AND NOT a.attnotnull END
 ) AS ok FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN (SELECT name FROM required_tables) AND a.attname IN ('publishedAt','readAt','readById','readByName') AND NOT a.attisdropped
), triggers_ok AS (
 SELECT count(*)=3 AND bool_and(t.tgenabled='O') AS ok FROM pg_trigger t
 WHERE NOT t.tgisinternal AND t.tgname IN ('steam_notice_publish','course_notice_publish','digital_notice_publish')
 AND t.tgrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN (SELECT name FROM required_tables))
)
SELECT jsonb_build_object('observedAt',statement_timestamp(),'readonly',current_setting('transaction_read_only'),
 'columnsReady',coalesce((SELECT ok FROM columns_ok),false),
 'publishTriggersReady',coalesce((SELECT ok FROM triggers_ok),false),
 'beautyReadGrantReady',CASE WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname='steamfoot_beauty_prod_20261025') AND (SELECT ok FROM columns_ok) THEN
 (SELECT bool_and(has_column_privilege('steamfoot_beauty_prod_20261025','public."DigitalManagerNotice"',c,'UPDATE')) FROM unnest(ARRAY['readAt','readById','readByName']) c)
 AND NOT has_column_privilege('steamfoot_beauty_prod_20261025','public."DigitalManagerNotice"','publishedAt','UPDATE')
 AND NOT has_table_privilege('steamfoot_beauty_prod_20261025','public."DigitalManagerNotice"','DELETE,TRUNCATE,TRIGGER') ELSE false END,
 'destructiveCapabilitiesAbsent',to_regprocedure('public.maintain_store_notice_retention()') IS NULL AND to_regclass('public."StoreNoticeExpiryReceipt"') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='store_notice_retention_maintainer')
) AS postflight;
COMMIT;
