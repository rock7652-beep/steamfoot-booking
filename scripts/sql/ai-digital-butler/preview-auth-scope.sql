-- Isolated project ttworfzgwejdeolegkxl only; applied separately from app migrations.
-- Newly generated synthetic owners must be seeded by the operator. No passwords here.
CREATE POLICY ai_preview_fixture_read ON "Store" FOR SELECT TO steamfoot_ai_preview_20261125
 USING (id IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music'));
CREATE POLICY ai_preview_fixture_read ON "User" FOR SELECT TO steamfoot_ai_preview_20261125
 USING (id IN ('ai-preview-owner-steamfoot','ai-preview-owner-beauty','ai-preview-owner-fitness','ai-preview-owner-music'));
CREATE POLICY ai_preview_fixture_read ON "Staff" FOR SELECT TO steamfoot_ai_preview_20261125
 USING ("storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music'));
CREATE POLICY ai_preview_fixture_read ON "ShopConfig" FOR SELECT TO steamfoot_ai_preview_20261125
 USING ("storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music'));
CREATE POLICY ai_preview_fixture_read ON "StoreFeatureEntitlement" FOR SELECT TO steamfoot_ai_preview_20261125
 USING ("storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music'));
GRANT INSERT, UPDATE ON "StaffLoginRecord" TO steamfoot_ai_preview_20261125;
CREATE POLICY ai_preview_fixture_login ON "StaffLoginRecord" TO steamfoot_ai_preview_20261125
 USING ("actorRoleSnapshot"='OWNER' AND outcome='SUCCESS'
  AND "storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music')
  AND "actorUserId" = 'ai-preview-owner-' || substring("storeId" from 12))
 WITH CHECK ("actorRoleSnapshot"='OWNER' AND outcome='SUCCESS'
  AND "storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music')
  AND "actorUserId" = 'ai-preview-owner-' || substring("storeId" from 12));
