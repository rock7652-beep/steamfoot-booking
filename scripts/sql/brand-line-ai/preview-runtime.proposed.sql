-- PROPOSAL ONLY. Target steamfoot-preview / ttworfzgwejdeolegkxl only.
-- The caller must verify project/TLS before this separate, explicitly approved transaction.
-- No new role, expiry change or privileges on any existing business table.
BEGIN;
DO $$ BEGIN
 IF current_user IS DISTINCT FROM pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public."BrandAiReplyLog"'::regclass))
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='steamfoot_ai_preview_20261125' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND (rolvaliduntil IS NULL OR rolvaliduntil>clock_timestamp()))
 OR has_any_column_privilege('steamfoot_ai_preview_20261125','public."BrandAiReplyLog"','SELECT')
 OR has_any_column_privilege('steamfoot_ai_preview_20261125','public."BrandAiReplyLog"','INSERT')
 OR has_any_column_privilege('steamfoot_ai_preview_20261125','public."BrandAiReplyLog"','UPDATE')
 THEN RAISE EXCEPTION 'BRAND_AI_RUNTIME_BASELINE_MISMATCH';END IF;
END $$;
GRANT SELECT,INSERT,UPDATE ON public."BrandAiReplyLog" TO steamfoot_ai_preview_20261125;
CREATE POLICY brand_line_ai_runtime ON public."BrandAiReplyLog"
 FOR ALL TO steamfoot_ai_preview_20261125 USING(true) WITH CHECK(true);
COMMIT;
