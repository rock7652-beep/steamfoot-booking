-- REVIEW ONLY: not authorized by the 2ed0b8e5a window and not applied remotely.
-- One additional invoker helper capability; no trigger changes or operational reads.
BEGIN;
DO $guard$ BEGIN
 IF TIMESTAMPTZ '__QA_WINDOW_UNTIL__'<=CURRENT_TIMESTAMP OR TIMESTAMPTZ '__QA_WINDOW_UNTIL__'>CURRENT_TIMESTAMP+INTERVAL '30 minutes' THEN RAISE EXCEPTION 'invalid approved window'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='steamfoot_ai_preview_20261125' AND NOT rolsuper AND NOT rolbypassrls) OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='steamfoot_ai_preview_20261125')) THEN RAISE EXCEPTION 'role mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public' AND p.oid=to_regprocedure('public.redact_audit_json(jsonb,integer)') AND NOT p.prosecdef AND l.lanname='plpgsql' AND p.prosrc=$reviewed_redactor$
DECLARE result jsonb; key text; item jsonb;
BEGIN
  IF value IS NULL THEN RETURN NULL; END IF;
  IF depth > 12 THEN RETURN to_jsonb('[內容過深]'::text); END IF;
  IF jsonb_typeof(value) = 'object' THEN
    result := '{}'::jsonb;
    FOR key, item IN SELECT * FROM jsonb_each(value) LOOP
      result := result || jsonb_build_object(key,
        CASE WHEN key ~* 'password|secret|token|authorization|cookie|otp|verificationcode'
        THEN to_jsonb('[已隱藏]'::text) ELSE public.redact_audit_json(item, depth + 1) END);
    END LOOP;
    RETURN result;
  ELSIF jsonb_typeof(value) = 'array' THEN
    result := '[]'::jsonb;
    FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP
      result := result || jsonb_build_array(public.redact_audit_json(item, depth + 1));
    END LOOP;
    RETURN result;
  END IF;
  RETURN value;
END;
$reviewed_redactor$) THEN RAISE EXCEPTION 'redaction function differs from reviewed pure JSON body'; END IF;
 IF has_function_privilege('steamfoot_ai_preview_20261125','public.redact_audit_json(jsonb,integer)','EXECUTE') THEN RAISE EXCEPTION 'unexpected pre-existing helper access'; END IF;
END $guard$;
GRANT EXECUTE ON FUNCTION public.redact_audit_json(jsonb,integer) TO steamfoot_ai_preview_20261125;
COMMIT;
