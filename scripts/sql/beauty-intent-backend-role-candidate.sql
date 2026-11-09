-- REVIEW / LOCAL REHEARSAL ONLY. Not an automatic migration.
-- Caller must set a reviewed backend LOGIN role in this same transaction:
-- SET LOCAL steamfoot_migration.beauty_intent_role = '<reviewed role>';
-- Store-level and user authorization remain the application's responsibility.
DO $$
DECLARE
  app_role text := current_setting('steamfoot_migration.beauty_intent_role', true);
  t text;
  scope_expr text;
  required_tables text[] := ARRAY['BeautyPurchaseIntent','BeautyOnlineConfirmIntent','BeautyCollectionIntent','BeautyCollectionIntentItem','BeautyMemberPurchaseIntent'];
BEGIN
  IF app_role IS NULL OR app_role='' OR app_role IN ('postgres','anon','authenticated','service_role') OR
     NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=app_role AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit) THEN
    RAISE EXCEPTION 'Explicit restricted backend login role required';
  END IF;
  IF pg_has_role('anon',app_role,'MEMBER') OR pg_has_role('authenticated',app_role,'MEMBER') THEN
    RAISE EXCEPTION 'Browser roles cannot inherit backend privileges';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles r WHERE (r.rolsuper OR r.rolbypassrls) AND pg_has_role(app_role,r.oid,'MEMBER')) THEN
    RAISE EXCEPTION 'Backend role may not assume an RLS-bypassing role';
  END IF;
  IF NOT has_schema_privilege(app_role,'public','USAGE') OR
     NOT has_column_privilege(app_role,'public."Store"','id','SELECT') OR
     NOT has_column_privilege(app_role,'public."Store"','industryModule','SELECT') OR
     NOT has_column_privilege(app_role,'public."Store"','operatingStatus','SELECT') OR
     NOT has_column_privilege(app_role,'public."Store"','id','UPDATE') THEN
    RAISE EXCEPTION 'Backend Store scope prerequisites are missing';
  END IF;
  FOREACH t IN ARRAY required_tables LOOP
    IF to_regclass(format('public.%I',t)) IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t AND c.relrowsecurity AND NOT c.relforcerowsecurity
        AND NOT pg_has_role(app_role,c.relowner,'MEMBER')
    ) THEN RAISE EXCEPTION 'Required RLS-enabled table missing or unexpected: %',t; END IF;
    IF has_table_privilege(app_role,format('public.%I',t),'DELETE') OR
       has_table_privilege('anon',format('public.%I',t),'SELECT,INSERT,UPDATE,DELETE') OR
       has_table_privilege('authenticated',format('public.%I',t),'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Existing privileges require manual review: %',t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t) THEN
      RAISE EXCEPTION 'Existing intent policies require manual review: %',t;
    END IF;
    scope_expr := format('EXISTS (SELECT 1 FROM public."Store" bs WHERE bs.id = %I."storeId" AND bs."industryModule"::text = ''BEAUTY'')',t);
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO %I',t,app_role);
    EXECUTE format('CREATE POLICY beauty_intent_select ON public.%I FOR SELECT TO %I USING (%s)',t,app_role,scope_expr);
    EXECUTE format('CREATE POLICY beauty_intent_insert ON public.%I FOR INSERT TO %I WITH CHECK (%s)',t,app_role,scope_expr);
    IF t <> 'BeautyOnlineConfirmIntent' THEN
      EXECUTE format('GRANT UPDATE ON public.%I TO %I',t,app_role);
      EXECUTE format('CREATE POLICY beauty_intent_update ON public.%I FOR UPDATE TO %I USING (%s) WITH CHECK (%s)',t,app_role,scope_expr,scope_expr);
    END IF;
  END LOOP;
END $$;
