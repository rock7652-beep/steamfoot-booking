-- PROPOSAL ONLY. Pristine schema rollback; never erase existing request history.
-- After activity, retain schema/provenance and disable AI; cron continues purging memory.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public."BrandAiConversation")
 OR EXISTS(SELECT 1 FROM public."BrandAiReplyLog" WHERE "knowledgeVersion" IS NOT NULL OR cardinality("knowledgeIds")>0)
 THEN RAISE EXCEPTION 'BRAND_V2_ACTIVITY_RETAIN_SCHEMA'; END IF;
END $$;
DROP TABLE public."BrandAiConversation";
ALTER TABLE public."BrandAiReplyLog" DROP COLUMN "knowledgeVersion", DROP COLUMN "knowledgeIds";
COMMIT;
