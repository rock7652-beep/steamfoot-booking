-- LOCAL/REVIEW ONLY. First stop AI and serve a compatible disabled deployment.
-- Never drop after registration/activity; retain the cost audit and use P0-off.
BEGIN;
DO $$
DECLARE registered boolean := false;
BEGIN
 IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM public._prisma_migrations WHERE migration_name=$1)' INTO registered USING '20261128073000_brand_ai_p0_diagnostics';
 END IF;
 IF registered THEN RAISE EXCEPTION 'P0_REGISTERED_RETAIN_SCHEMA'; END IF;
 IF EXISTS(SELECT 1 FROM public."BrandAiReplyLog" WHERE "repairStartedAt" IS NOT NULL OR diagnostics IS NOT NULL)
 THEN RAISE EXCEPTION 'P0_ACTIVITY_RETAIN_AUDIT'; END IF;
END $$;
DROP INDEX public."BrandAiReplyLog_repairStartedAt_idx";
ALTER TABLE public."BrandAiReplyLog"
 DROP CONSTRAINT "BrandAiReplyLog_repair_requires_first",
 DROP CONSTRAINT "BrandAiReplyLog_diagnostics_bound",
 DROP COLUMN "repairStartedAt", DROP COLUMN diagnostics;
COMMIT;
