-- Manual, isolated steamfoot-preview only. No production migration runner.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='steamfoot_ai_preview_20261125'
    AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND rolconnlimit=8)
    OR NOT EXISTS (SELECT 1 FROM public."Store" WHERE id='ai-preview-steamfoot' AND "isDemo"=true AND "industryModule"::text='STEAMFOOT')
  THEN RAISE EXCEPTION 'AI_AVAILABILITY_ISOLATION_REQUIRED'; END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('Booking','DutyAssignment') AND c.relrowsecurity)<>2
  THEN RAISE EXCEPTION 'AI_AVAILABILITY_RLS_REQUIRED'; END IF;
END $$;
CREATE POLICY ai_preview_availability_read ON public."Booking"
  FOR SELECT TO steamfoot_ai_preview_20261125 USING ("storeId"='ai-preview-steamfoot');
CREATE POLICY ai_preview_availability_read ON public."DutyAssignment"
  FOR SELECT TO steamfoot_ai_preview_20261125 USING ("storeId"='ai-preview-steamfoot');
-- Revert only these row reads (retain data and all existing policies):
-- DROP POLICY ai_preview_availability_read ON public."Booking";
-- DROP POLICY ai_preview_availability_read ON public."DutyAssignment";
