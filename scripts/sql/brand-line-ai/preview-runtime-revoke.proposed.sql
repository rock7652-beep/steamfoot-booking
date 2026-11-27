-- PROPOSAL ONLY. Remove only the matching grants installed by preview-runtime.proposed.sql.
-- The installer requires a pristine SELECT/INSERT/UPDATE baseline; never apply to another role.
-- Retain the table, all history and the formal migration. No DROP TABLE / CASCADE.
BEGIN;
DO $$ BEGIN
 IF current_user IS DISTINCT FROM pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public."BrandAiReplyLog"'::regclass))
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='BrandAiReplyLog'
   AND policyname='brand_line_ai_runtime' AND roles=ARRAY['steamfoot_ai_preview_20261125']::name[]
   AND cmd='ALL' AND permissive='PERMISSIVE' AND qual='true' AND with_check='true')
 THEN RAISE EXCEPTION 'BRAND_AI_RUNTIME_REVOKE_BASELINE_MISMATCH'; END IF;
END $$;
DROP POLICY brand_line_ai_runtime ON public."BrandAiReplyLog";
REVOKE SELECT,INSERT,UPDATE ON public."BrandAiReplyLog" FROM steamfoot_ai_preview_20261125;
COMMIT;
