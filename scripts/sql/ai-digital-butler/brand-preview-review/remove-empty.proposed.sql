-- PREPARED ONLY / NOT AUTHORIZED TO RUN. Exact target: steamfoot-preview (ttworfzgwejdeolegkxl).
-- Use only the explicitly approved project_id; database name postgres is NOT project identity.
-- All remote execution needs a new explicit authorization. Local PGlite rehearsal only.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT id FROM public."AiButlerControl" WHERE id='global' FOR UPDATE;
DO $guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public."AiButlerControl" WHERE id='global' AND stopped=true) THEN RAISE EXCEPTION 'AI_MUST_REMAIN_STOPPED'; END IF;
 IF (SELECT count(*) FROM public."AiButlerSetting" WHERE "storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music') AND setting->>'enabled'='false') <> 4 THEN RAISE EXCEPTION 'FOUR_DISABLED_STORES_REQUIRED'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='steamfoot_ai_preview_20261125' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND (rolvaliduntil IS NULL OR rolvaliduntil>CURRENT_TIMESTAMP)) THEN RAISE EXCEPTION 'EXISTING_ISOLATED_ROLE_REQUIRED'; END IF;
END;
$guard$;
DO $empty$
BEGIN
 IF EXISTS (SELECT 1 FROM public."AiBrandRequest") OR EXISTS (SELECT 1 FROM public."AiBrandDispatch") OR EXISTS (SELECT 1 FROM public."AiBrandHandoffAudit") OR EXISTS (SELECT 1 FROM public."AiBrandConversation") THEN RAISE EXCEPTION 'BRAND_ACTIVITY_REQUIRES_RETENTION_SOFT_STOP'; END IF;
 IF EXISTS (SELECT 1 FROM public."AiBrandService" WHERE "id"<>'ai-preview-brand-steamfoot') THEN RAISE EXCEPTION 'FOREIGN_BRAND_DATA_REQUIRES_RETENTION'; END IF;
 IF EXISTS (SELECT 1 FROM public."AiBrandGrant" WHERE "serviceId"<>'ai-preview-brand-steamfoot') THEN RAISE EXCEPTION 'FOREIGN_BRAND_DATA_REQUIRES_RETENTION'; END IF;
 IF EXISTS (SELECT 1 FROM public."AiBrandSetting" WHERE "serviceId"<>'ai-preview-brand-steamfoot') THEN RAISE EXCEPTION 'FOREIGN_BRAND_DATA_REQUIRES_RETENTION'; END IF;
 IF EXISTS (SELECT 1 FROM public."AiBrandConversation" WHERE "serviceId"<>'ai-preview-brand-steamfoot') THEN RAISE EXCEPTION 'FOREIGN_BRAND_DATA_REQUIRES_RETENTION'; END IF;
 IF EXISTS (SELECT 1 FROM public."AiBrandRequest" WHERE "serviceId"<>'ai-preview-brand-steamfoot') THEN RAISE EXCEPTION 'FOREIGN_BRAND_DATA_REQUIRES_RETENTION'; END IF;
 IF EXISTS (SELECT 1 FROM public."AiBrandDispatch" WHERE "serviceId"<>'ai-preview-brand-steamfoot') THEN RAISE EXCEPTION 'FOREIGN_BRAND_DATA_REQUIRES_RETENTION'; END IF;
 IF EXISTS (SELECT 1 FROM public."AiBrandHandoffAudit" WHERE "serviceId"<>'ai-preview-brand-steamfoot') THEN RAISE EXCEPTION 'FOREIGN_BRAND_DATA_REQUIRES_RETENTION'; END IF;
 IF EXISTS (SELECT 1 FROM public."AiBrandKnowledgeDocument" WHERE "serviceId"<>'ai-preview-brand-steamfoot') THEN RAISE EXCEPTION 'FOREIGN_BRAND_DATA_REQUIRES_RETENTION'; END IF;
END;
$empty$;
DROP FUNCTION public.ai_owner_global_totals();
DROP TABLE public."AiBrandKnowledgeDocument";
DROP TABLE public."AiBrandHandoffAudit";
DROP TABLE public."AiBrandDispatch";
DROP TABLE public."AiBrandRequest";
DROP TABLE public."AiBrandConversation";
DROP TABLE public."AiBrandSetting";
DROP TABLE public."AiBrandGrant";
DROP TABLE public."AiBrandService";
-- No CASCADE; unexpected dependencies abort the whole transaction.
COMMIT;
