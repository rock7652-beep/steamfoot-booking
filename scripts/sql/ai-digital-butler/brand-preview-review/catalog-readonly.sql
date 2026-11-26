-- Exact tool project_id: ttworfzgwejdeolegkxl. No credentials or operational user rows.
BEGIN READ ONLY;
SELECT jsonb_build_object(
 'inspectionRole',current_user,
 'globalStopped',(SELECT stopped FROM public."AiButlerControl" WHERE id='global'),
 'settings',(SELECT jsonb_agg(jsonb_build_object('storeId',"storeId",'enabled',setting->>'enabled')) FROM public."AiButlerSetting" WHERE "storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music')),
 'brandTables',(SELECT jsonb_agg(jsonb_build_object('name',name,'installed',to_regclass('public.'||quote_ident(name)) IS NOT NULL)) FROM unnest(ARRAY['AiBrandService','AiBrandGrant','AiBrandSetting','AiBrandConversation','AiBrandRequest','AiBrandDispatch','AiBrandHandoffAudit','AiBrandKnowledgeDocument']) names(name)),
 'aggregateInstalled',to_regprocedure('public.ai_owner_global_totals()') IS NOT NULL,
 'role',(SELECT to_jsonb(r) FROM (SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolconnlimit,rolvaliduntil FROM pg_roles WHERE rolname='steamfoot_ai_preview_20261125')r),
 'requests',(SELECT jsonb_build_object('count',count(*),'openai',count(*) FILTER(WHERE provider='openai'),'unresolved',count(*) FILTER(WHERE status IN('RESERVED','UNKNOWN')),'heldMicros',coalesce(sum("heldMicros"),0)) FROM public."AiButlerRequest"),
 'dispatch',(SELECT jsonb_build_object('count',count(*),'unresolved',count(*) FILTER(WHERE status IN('CLAIMED','UNKNOWN'))) FROM public."AiButlerDispatch")
) AS audit;
COMMIT;
