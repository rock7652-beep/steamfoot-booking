-- Isolated project ttworfzgwejdeolegkxl only. New synthetic rows; no existing accounts edited.
INSERT INTO "Store" (id,name,slug,"industryModule",plan,"isDemo","updatedAt") VALUES
 ('ai-preview-steamfoot','AI 合成蒸足測試店','ai-preview-steamfoot','STEAMFOOT','BASIC',true,now()),
 ('ai-preview-beauty','AI 合成美業測試店','ai-preview-beauty','BEAUTY','BASIC',true,now()),
 ('ai-preview-fitness','AI 合成運動測試店','ai-preview-fitness','COURSE','BASIC',true,now()),
 ('ai-preview-music','AI 合成音樂測試店','ai-preview-music','COURSE','BASIC',true,now());
INSERT INTO "StoreFeatureEntitlement" (id,"storeId","featureKey",status,"updatedAt")
 SELECT 'ai-preview-grant-'||id,id,'ai_digital_butler','ENABLED',now() FROM "Store" WHERE id IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music');
INSERT INTO "AiButlerSetting" ("storeId",setting) SELECT id,
 '{"enabled":false,"model":"gpt-6-luna","channels":["TEST"],"monthlyBudgetMicros":1000000,"dailyRequests":20,"monthlyRequests":100}'::jsonb
 FROM "Store" WHERE id IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music');
-- Global stop remains ON until the operator explicitly starts synthetic testing.
CREATE ROLE steamfoot_ai_preview_20261125 NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8;
GRANT CONNECT ON DATABASE postgres TO steamfoot_ai_preview_20261125;
GRANT USAGE ON SCHEMA public TO steamfoot_ai_preview_20261125;
-- Existing shared dashboard readers need the shared schema. No business writes granted.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO steamfoot_ai_preview_20261125;
GRANT SELECT, INSERT, UPDATE ON "AiButlerControl", "AiButlerSetting", "AiButlerConversation", "AiButlerRequest" TO steamfoot_ai_preview_20261125;
CREATE POLICY ai_preview_server ON "AiButlerControl" TO steamfoot_ai_preview_20261125 USING (true) WITH CHECK (true);
CREATE POLICY ai_preview_server ON "AiButlerSetting" TO steamfoot_ai_preview_20261125
 USING ("storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music'))
 WITH CHECK ("storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music'));
CREATE POLICY ai_preview_server ON "AiButlerConversation" TO steamfoot_ai_preview_20261125
 USING ("storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music'))
 WITH CHECK ("storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music'));
CREATE POLICY ai_preview_server ON "AiButlerRequest" TO steamfoot_ai_preview_20261125
 USING ("storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music'))
 WITH CHECK ("storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music'));
