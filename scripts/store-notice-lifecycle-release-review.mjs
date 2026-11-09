import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const NOTICE_LIFECYCLE_SQL='scripts/sql/store-notice-lifecycle-phase1.sql';
export const NOTICE_LIFECYCLE_SHA256='38ef2b8aede9af8a5a863e6db94dd381f9c09dc31f66f8d310c6dae7fd02f12d';
export const NOTICE_GRACE_BASELINE={count:2,fingerprint:'5f2dd03ca1756c1afd728b9fa046b5b6'};
export function reviewedNoticeLifecycleSql(){
 const sql=readFileSync(NOTICE_LIFECYCLE_SQL,'utf8');
 if(createHash('sha256').update(sql).digest('hex')!==NOTICE_LIFECYCLE_SHA256)throw Error('notice_lifecycle_sql_checksum_mismatch');
 return sql;
}
/** Must run inside the guarded migration transaction with write scopes locked.
 * A changed population requires a new impact review, never silently wider grace. */
export function assertNoticeGraceBaseline(observation){
 if(observation?.count!==NOTICE_GRACE_BASELINE.count||observation?.fingerprint!==NOTICE_GRACE_BASELINE.fingerprint)
  throw Error('notice_lifecycle_grace_population_changed');
 return true;
}

export const NOTICE_LIFECYCLE_MIGRATION_NAME='store_notice_lifecycle_display_only_20261101';
/** One allowlisted managed-service migration, one atomic transaction, no deletes.
 * The connector records this exact name in supabase_migrations; Prisma history is
 * retained unchanged. This does not call generic Prisma migrate deploy. */
export function buildNoticeLifecycleMigrationQuery(){
 const sql=reviewedNoticeLifecycleSql();
 const schemaCheck=readFileSync('scripts/qa/store-notice-lifecycle-schema-fingerprint.sql','utf8').replace(/^--.*\n/gm,'').trim().replace(/;$/,'');
 const before=`
SELECT pg_advisory_xact_lock(2026110101::bigint);
LOCK TABLE public."SteamfootStoreNotice",public."CourseStoreNotice",public."DigitalManagerNotice" IN ACCESS EXCLUSIVE MODE NOWAIT;
CREATE TEMP TABLE notice_lifecycle_before ON COMMIT DROP AS SELECT
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(n) ORDER BY id),'[]'::jsonb)::text) FROM public."SteamfootStoreNotice" n) AS steam,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(n) ORDER BY id),'[]'::jsonb)::text) FROM public."CourseStoreNotice" n) AS course,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(n) ORDER BY id),'[]'::jsonb)::text) FROM public."DigitalManagerNotice" n) AS digital,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(n) ORDER BY id),'[]'::jsonb)::text) FROM public._prisma_migrations n) AS ledger;
DO $guard$
DECLARE grace_count int; grace_hash text;
BEGIN
 IF current_database()<>'postgres' THEN RAISE EXCEPTION 'notice_database_rejected'; END IF;
 IF EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN RAISE EXCEPTION 'unfinished_migrations_rejected'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('SteamfootStoreNotice','CourseStoreNotice','DigitalManagerNotice') AND column_name IN ('publishedAt','readAt','readById','readByName')) OR to_regclass('public."StoreNoticeExpiryReceipt"') IS NOT NULL THEN RAISE EXCEPTION 'partial_or_installed_schema_rejected'; END IF;
 SELECT count(*)::int,md5(coalesce(string_agg(source||':'||"storeId"||':'||id,'|' ORDER BY source,"storeId",id),'')) INTO grace_count,grace_hash FROM (
 SELECT 'SteamfootStoreNotice' AS source,"storeId",id,"createdAt","updatedAt","handledAt" FROM public."SteamfootStoreNotice"
 UNION ALL SELECT 'CourseStoreNotice',"storeId",id,"createdAt","updatedAt","handledAt" FROM public."CourseStoreNotice"
 UNION ALL SELECT 'DigitalManagerNotice',"storeId",id,"createdAt","updatedAt","handledAt" FROM public."DigitalManagerNotice"
 )n WHERE "createdAt"<=statement_timestamp()-interval '240 hours' AND "updatedAt">statement_timestamp()-interval '240 hours' AND "handledAt" IS NULL;
 IF grace_count<>${NOTICE_GRACE_BASELINE.count} OR grace_hash<>'${NOTICE_GRACE_BASELINE.fingerprint}' THEN RAISE EXCEPTION 'notice_lifecycle_grace_population_changed'; END IF;
END $guard$;
`;
 const after=`
DO $postflight$
DECLARE legacy_unchanged boolean; schema_hash text;
BEGIN
 SELECT b.steam=(SELECT md5(coalesce(jsonb_agg(to_jsonb(n)-ARRAY['publishedAt','readAt','readById','readByName'] ORDER BY id),'[]'::jsonb)::text) FROM public."SteamfootStoreNotice" n)
 AND b.course=(SELECT md5(coalesce(jsonb_agg(to_jsonb(n)-ARRAY['publishedAt','readAt','readById','readByName'] ORDER BY id),'[]'::jsonb)::text) FROM public."CourseStoreNotice" n)
 AND b.digital=(SELECT md5(coalesce(jsonb_agg(to_jsonb(n)-ARRAY['publishedAt','readAt','readById','readByName'] ORDER BY id),'[]'::jsonb)::text) FROM public."DigitalManagerNotice" n)
 AND b.ledger=(SELECT md5(coalesce(jsonb_agg(to_jsonb(n) ORDER BY id),'[]'::jsonb)::text) FROM public._prisma_migrations n) INTO legacy_unchanged FROM notice_lifecycle_before b;
 IF legacy_unchanged IS DISTINCT FROM true THEN RAISE EXCEPTION 'notice_legacy_data_changed'; END IF;
 SELECT fingerprint INTO schema_hash FROM (${schemaCheck}) fingerprint_check;
 IF schema_hash<>'27af17e45cc23f72cd85f89b6d5f83fb' THEN RAISE EXCEPTION 'notice_lifecycle_schema_rejected'; END IF;
END $postflight$;
`;
 return sql.replace("SET LOCAL statement_timeout = '60s';","SET LOCAL statement_timeout = '60s';\n"+before).replace(/COMMIT;\s*$/,after+'\nCOMMIT;\n');
}
