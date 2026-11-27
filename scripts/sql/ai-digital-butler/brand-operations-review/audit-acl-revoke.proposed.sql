-- Keep all AuditLog rows; remove only this proposal's write access.
BEGIN;
REVOKE INSERT(id,"actorUserId","actorRoleSnapshot",source,"storeId",module,"targetType","targetId",action,summary,"beforeJson","afterJson","createdAt") ON public."AuditLog" FROM steamfoot_ai_preview_20261125;
DROP POLICY IF EXISTS ai_brand_preview_operation_insert ON public."AuditLog";
DROP POLICY IF EXISTS ai_brand_preview_operation_read ON public."AuditLog";
-- Audit rows remain; the management connection can verify them read-only.
COMMIT;
