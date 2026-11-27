-- Only after a separately approved helper grant; retain all audit rows.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.redact_audit_json(jsonb,integer) FROM steamfoot_ai_preview_20261125;
COMMIT;
