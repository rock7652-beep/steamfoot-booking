-- Inventory only. Never apply the candidate SQL through this report.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object(
 'observedAt',statement_timestamp(),
 'readonly',current_setting('transaction_read_only'),
 'database',current_database(),
 'tables',(SELECT jsonb_agg(to_jsonb(s)) FROM (
  SELECT 'SteamfootStoreNotice' AS source,count(*) AS total,count(DISTINCT "storeId") AS stores,
   count(*) FILTER(WHERE "createdAt">now()-interval '72 hours') AS latest,
   count(*) FILTER(WHERE "createdAt"<=now()-interval '72 hours' AND "createdAt">now()-interval '240 hours') AS history,
   count(*) FILTER(WHERE "createdAt"<=now()-interval '240 hours') AS expired,
   count(*) FILTER(WHERE "createdAt"<=now()-interval '240 hours' AND "handledAt" IS NULL) AS expired_unread,
   count(*) FILTER(WHERE "createdAt"<=now()-interval '240 hours' AND "updatedAt">now()-interval '240 hours') AS uncertain_recent_update,
   min("createdAt") AS oldest,max("createdAt") AS newest FROM public."SteamfootStoreNotice"
  UNION ALL SELECT 'CourseStoreNotice',count(*),count(DISTINCT "storeId"),
   count(*) FILTER(WHERE "createdAt">now()-interval '72 hours'),
   count(*) FILTER(WHERE "createdAt"<=now()-interval '72 hours' AND "createdAt">now()-interval '240 hours'),
   count(*) FILTER(WHERE "createdAt"<=now()-interval '240 hours'),
   count(*) FILTER(WHERE "createdAt"<=now()-interval '240 hours' AND "handledAt" IS NULL),
   count(*) FILTER(WHERE "createdAt"<=now()-interval '240 hours' AND "updatedAt">now()-interval '240 hours'),min("createdAt"),max("createdAt") FROM public."CourseStoreNotice"
  UNION ALL SELECT 'DigitalManagerNotice',count(*),count(DISTINCT "storeId"),
   count(*) FILTER(WHERE "createdAt">now()-interval '72 hours'),
   count(*) FILTER(WHERE "createdAt"<=now()-interval '72 hours' AND "createdAt">now()-interval '240 hours'),
   count(*) FILTER(WHERE "createdAt"<=now()-interval '240 hours'),
   count(*) FILTER(WHERE "createdAt"<=now()-interval '240 hours' AND "handledAt" IS NULL),
   count(*) FILTER(WHERE "createdAt"<=now()-interval '240 hours' AND "updatedAt">now()-interval '240 hours'),min("createdAt"),max("createdAt") FROM public."DigitalManagerNotice"
 ) s),
 'indexes',(SELECT jsonb_agg(to_jsonb(i)) FROM (SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('SteamfootStoreNotice','CourseStoreNotice','DigitalManagerNotice') ORDER BY tablename,indexname)i),
 'lifecycleColumns',(SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('SteamfootStoreNotice','CourseStoreNotice','DigitalManagerNotice') AND column_name IN ('publishedAt','readAt','readById','readByName')),
 'unfinishedMigrations',(SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL),
 'maintenanceRoleExists',EXISTS(SELECT 1 FROM pg_roles WHERE rolname='store_notice_retention_maintainer')
) AS inventory;
COMMIT;
