-- REVIEW ONLY. Apply only to steamfoot-preview after explicit approval.
-- Existing AuditLog table and User FK; no new table, role or store permission.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public."AuditLog"'::regclass AND relrowsecurity AND relowner<>(SELECT oid FROM pg_roles WHERE rolname='steamfoot_ai_preview_20261125')) OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='steamfoot_ai_preview_20261125' AND NOT rolsuper AND NOT rolbypassrls) THEN RAISE EXCEPTION 'AuditLog RLS/role boundary mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='steamfoot_ai_preview_20261125')) THEN RAISE EXCEPTION 'unexpected role membership'; END IF;
 IF has_any_column_privilege('steamfoot_ai_preview_20261125','public."AuditLog"','INSERT') THEN RAISE EXCEPTION 'unexpected pre-existing AuditLog insert privilege'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE tablename='AuditLog' AND cmd IN ('ALL','INSERT') AND ('steamfoot_ai_preview_20261125'=ANY(roles) OR 'public'=ANY(roles))) THEN RAISE EXCEPTION 'unexpected prior audit write policy'; END IF;
END $$;
CREATE POLICY ai_brand_preview_operation_read ON public."AuditLog" FOR SELECT TO steamfoot_ai_preview_20261125
USING (CURRENT_TIMESTAMP<TIMESTAMPTZ '__QA_WINDOW_UNTIL__' AND "actorUserId"='ai-preview-brand-hq' AND "actorRoleSnapshot"='ADMIN' AND source='AI_BRAND_PREVIEW' AND "storeId" IS NULL AND module='AI_BRAND' AND "targetType"='AiBrandService' AND "targetId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_operation_insert ON public."AuditLog" FOR INSERT TO steamfoot_ai_preview_20261125
WITH CHECK ("actorUserId"='ai-preview-brand-hq' AND "actorRoleSnapshot"='ADMIN' AND source='AI_BRAND_PREVIEW' AND "storeId" IS NULL AND module='AI_BRAND' AND "targetType"='AiBrandService' AND "targetId"='ai-preview-brand-steamfoot' AND action='UPDATE' AND CURRENT_TIMESTAMP<TIMESTAMPTZ '__QA_WINDOW_UNTIL__' AND "createdAt"<=TIMESTAMPTZ '__QA_WINDOW_UNTIL__'
 AND EXISTS(SELECT 1 FROM public."User" u WHERE u.id="actorUserId" AND u.role='ADMIN' AND u.status='ACTIVE' AND u."passwordHash" IS NOT NULL)
 AND "afterJson"->>'operation' IN ('save','publish','withdraw','setting','handoff','resume','test'));
GRANT INSERT(id,"actorUserId","actorRoleSnapshot",source,"storeId",module,"targetType","targetId",action,summary,"beforeJson","afterJson","createdAt") ON public."AuditLog" TO steamfoot_ai_preview_20261125;
COMMIT;
