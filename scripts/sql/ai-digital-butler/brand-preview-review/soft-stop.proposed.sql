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
-- Soft rollback retains ALL cost, dispatch and handoff evidence.
UPDATE public."AiBrandSetting" SET setting=jsonb_set(setting,'{enabled}','false'::jsonb),revision=revision+1 WHERE "serviceId"='ai-preview-brand-steamfoot';
UPDATE public."AiBrandGrant" SET status='HIDDEN' WHERE "serviceId"='ai-preview-brand-steamfoot';
REVOKE ALL ON public."AiBrandService", public."AiBrandGrant", public."AiBrandSetting", public."AiBrandConversation", public."AiBrandRequest", public."AiBrandDispatch", public."AiBrandHandoffAudit", public."AiBrandKnowledgeDocument" FROM steamfoot_ai_preview_20261125;
-- Keep narrow aggregate EXECUTE: Store mode must still count retained Brand costs.
-- No deletion, quota reset, Store changes, role changes or global-default ACL change.
COMMIT;
