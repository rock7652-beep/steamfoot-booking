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
END;
$guard$;
DO $empty$
BEGIN
 IF EXISTS (SELECT 1 FROM public."AiBrandService" WHERE "id"<>'ai-preview-brand-steamfoot') THEN RAISE EXCEPTION 'FOREIGN_BRAND_DATA_REQUIRES_RETENTION'; END IF;
 IF EXISTS (SELECT 1 FROM public."AiBrandGrant" WHERE "serviceId"<>'ai-preview-brand-steamfoot') THEN RAISE EXCEPTION 'FOREIGN_BRAND_DATA_REQUIRES_RETENTION'; END IF;
 IF EXISTS (SELECT 1 FROM public."AiBrandSetting" WHERE "serviceId"<>'ai-preview-brand-steamfoot') THEN RAISE EXCEPTION 'FOREIGN_BRAND_DATA_REQUIRES_RETENTION'; END IF;
 IF EXISTS (SELECT 1 FROM public."AiBrandConversation" WHERE "serviceId"<>'ai-preview-brand-steamfoot') THEN RAISE EXCEPTION 'FOREIGN_BRAND_DATA_REQUIRES_RETENTION'; END IF;
 IF EXISTS (SELECT 1 FROM public."AiBrandRequest" WHERE "serviceId"<>'ai-preview-brand-steamfoot') THEN RAISE EXCEPTION 'FOREIGN_BRAND_DATA_REQUIRES_RETENTION'; END IF;
 IF EXISTS (SELECT 1 FROM public."AiBrandDispatch" WHERE "serviceId"<>'ai-preview-brand-steamfoot') THEN RAISE EXCEPTION 'FOREIGN_BRAND_DATA_REQUIRES_RETENTION'; END IF;
 IF EXISTS (SELECT 1 FROM public."AiBrandHandoffAudit" WHERE "serviceId"<>'ai-preview-brand-steamfoot') THEN RAISE EXCEPTION 'FOREIGN_BRAND_DATA_REQUIRES_RETENTION'; END IF;
 IF EXISTS (SELECT 1 FROM public."AiBrandKnowledgeDocument" WHERE "serviceId"<>'ai-preview-brand-steamfoot') THEN RAISE EXCEPTION 'FOREIGN_BRAND_DATA_REQUIRES_RETENTION'; END IF;
 IF EXISTS (SELECT 1 FROM public."AiBrandKnowledgeDocument" WHERE revision<>0 OR published IS NOT NULL OR "publishedVersion"<>0 OR draft IS DISTINCT FROM '{"introduction": "這是蒸管家品牌客服的隔離合成知識，不代表正式公告。", "faqs": [{"question": "測試產品價格？", "answer": "合成測試方案每月 NT$999，僅供隔離驗收，不代表正式售價。"}], "prohibitedTerms": [], "references": {"hours": false, "services": false, "prices": false}}'::jsonb)
  OR EXISTS (SELECT 1 FROM public."AiBrandSetting" WHERE revision<>1 OR setting IS DISTINCT FROM '{"enabled": false, "model": "gpt-6-luna", "channels": ["TEST"], "monthlyBudgetMicros": 1000000, "dailyRequests": 20, "monthlyRequests": 100}'::jsonb)
  OR EXISTS (SELECT 1 FROM public."AiBrandGrant" WHERE status<>'HIDDEN' OR "startsAt" IS NOT NULL OR "expiresAt" IS NOT NULL)
  OR EXISTS (SELECT 1 FROM public."AiBrandService" WHERE name<>'蒸管家品牌客服（隔離合成）')
 THEN RAISE EXCEPTION 'BRAND_CONFIG_CHANGED_REQUIRES_RETENTION' ; END IF;
 IF EXISTS (SELECT 1 FROM public."AiBrandRequest") OR EXISTS (SELECT 1 FROM public."AiBrandDispatch") OR EXISTS (SELECT 1 FROM public."AiBrandHandoffAudit") OR EXISTS (SELECT 1 FROM public."AiBrandConversation") THEN RAISE EXCEPTION 'BRAND_ACTIVITY_REQUIRES_RETENTION_SOFT_STOP'; END IF;
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
