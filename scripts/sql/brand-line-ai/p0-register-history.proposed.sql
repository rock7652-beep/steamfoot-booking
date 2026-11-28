-- REVIEW ONLY: Production qijlnhtpbintanzpxkvf, after exact DDL/schema/ACL verification.
-- Only this new Prisma row. Drift stops; never repair unrelated history.
BEGIN;
SET LOCAL statement_timeout='5s';
SELECT pg_advisory_xact_lock(72707369);
DO $$ BEGIN
 IF current_user <> 'postgres'
 OR current_user IS DISTINCT FROM pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public._prisma_migrations'::regclass))
 OR (SELECT count(*) FROM public._prisma_migrations)<>161
 OR (SELECT md5(string_agg(to_jsonb(m)::text,'' ORDER BY id)) FROM public._prisma_migrations m)<>'f862f66d4a758a0109c87f737b0a9476'
 OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261128073000_brand_ai_p0_diagnostics')
 OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)
 OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='BrandAiReplyLog')<>13
 OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='BrandAiReplyLog' AND column_name='repairStartedAt' AND data_type='timestamp with time zone' AND datetime_precision=3)
 OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='BrandAiReplyLog' AND column_name='diagnostics' AND udt_name='jsonb')
 OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public."BrandAiReplyLog"'::regclass)
 OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public."BrandAiReplyLog"'::regclass AND conname IN('BrandAiReplyLog_repair_requires_first','BrandAiReplyLog_diagnostics_bound'))<>2
 OR NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='BrandAiReplyLog_repairStartedAt_idx')
 THEN RAISE EXCEPTION 'P0_HISTORY_REGISTRATION_REJECTED'; END IF;
END $$;
INSERT INTO public._prisma_migrations(id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count)
VALUES(gen_random_uuid()::text,'ab64f860fd99f3e7391118031a6e3400a9d2fcd4fcea0628d659fc585b9a4b0d',CURRENT_TIMESTAMP,'20261128073000_brand_ai_p0_diagnostics','',NULL,CURRENT_TIMESTAMP,1);
COMMIT;

