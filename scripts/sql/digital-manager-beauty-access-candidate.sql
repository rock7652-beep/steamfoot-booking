-- Isolated review candidate; set the dedicated Beauty runtime role explicitly.
-- No deletes or direct API access. Server actions still enforce active-store scope.
BEGIN;
DO $$
DECLARE app_role text:=current_setting('beauty_migration.app_role',true);
DECLARE predicate text := '(("eventType" = ''TRANSFER_PENDING_CONFIRMATION'' AND "eventKey" LIKE ''beauty-purchase-pending:%'') OR ("eventType" = ''INCOMPLETE_SERVICE_REMINDER'' AND "eventKey" LIKE ''beauty-incomplete:%'') OR ("eventType" = ''DAILY_ACTION_DIGEST'' AND "eventKey" LIKE ''beauty-digest:%'')) AND EXISTS (SELECT 1 FROM public."Store" s WHERE s.id = "DigitalManagerNotice"."storeId" AND s."industryModule"::text = ''BEAUTY'')';
BEGIN
 IF app_role IS NULL OR app_role !~ '^steamfoot_beauty_(data_[a-z][a-z0-9_]{0,34}|prod_[0-9]{8})$' OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=app_role AND NOT rolsuper AND NOT rolbypassrls) THEN
  RAISE EXCEPTION 'A dedicated non-bypass Beauty runtime role is required';
 END IF;
 IF to_regclass('public."DigitalManagerNotice"') IS NULL THEN RAISE EXCEPTION 'Digital manager notice table is required'; END IF;
 IF to_regclass('public."DigitalManagerActivation"') IS NULL THEN RAISE EXCEPTION 'Digital manager activation table is required'; END IF;
 IF NOT has_column_privilege(app_role,'public."Store"','id','SELECT') OR NOT has_column_privilege(app_role,'public."Store"','industryModule','SELECT') THEN
  RAISE EXCEPTION 'Beauty runtime role must be able to read the store ID and industry module';
 END IF;
 EXECUTE format('GRANT SELECT, INSERT ON public."DigitalManagerNotice" TO %I',app_role);
 EXECUTE format('GRANT UPDATE ("handledAt","handledById","handledByName",revision,"updatedAt") ON public."DigitalManagerNotice" TO %I',app_role);
 EXECUTE format('GRANT SELECT, INSERT ON public."DigitalManagerActivation" TO %I',app_role);
 EXECUTE format('GRANT UPDATE ("activatedAt") ON public."DigitalManagerActivation" TO %I',app_role);
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='DigitalManagerNotice' AND policyname='beauty_digital_manager_read') THEN
  EXECUTE format('CREATE POLICY beauty_digital_manager_read ON public."DigitalManagerNotice" FOR SELECT TO %I USING (%s)',app_role,predicate);
  EXECUTE format('CREATE POLICY beauty_digital_manager_insert ON public."DigitalManagerNotice" FOR INSERT TO %I WITH CHECK (%s)',app_role,predicate);
  EXECUTE format('CREATE POLICY beauty_digital_manager_update ON public."DigitalManagerNotice" FOR UPDATE TO %I USING (%s) WITH CHECK (%s)',app_role,predicate,predicate);
 ELSIF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='DigitalManagerNotice' AND policyname IN ('beauty_digital_manager_read','beauty_digital_manager_insert','beauty_digital_manager_update') AND app_role=ANY(roles::text[])) <> 3 THEN
  RAISE EXCEPTION 'Existing Beauty notice policies do not match the specified role';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='DigitalManagerActivation' AND policyname='beauty_digital_activation_read') THEN
  EXECUTE format('CREATE POLICY beauty_digital_activation_read ON public."DigitalManagerActivation" FOR SELECT TO %I USING (EXISTS (SELECT 1 FROM public."Store" s WHERE s.id="DigitalManagerActivation"."storeId" AND s."industryModule"::text=''BEAUTY''))',app_role);
  EXECUTE format('CREATE POLICY beauty_digital_activation_insert ON public."DigitalManagerActivation" FOR INSERT TO %I WITH CHECK (EXISTS (SELECT 1 FROM public."Store" s WHERE s.id="DigitalManagerActivation"."storeId" AND s."industryModule"::text=''BEAUTY''))',app_role);
  EXECUTE format('CREATE POLICY beauty_digital_activation_update ON public."DigitalManagerActivation" FOR UPDATE TO %I USING (EXISTS (SELECT 1 FROM public."Store" s WHERE s.id="DigitalManagerActivation"."storeId" AND s."industryModule"::text=''BEAUTY'')) WITH CHECK (EXISTS (SELECT 1 FROM public."Store" s WHERE s.id="DigitalManagerActivation"."storeId" AND s."industryModule"::text=''BEAUTY''))',app_role);
 ELSIF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='DigitalManagerActivation' AND policyname IN ('beauty_digital_activation_read','beauty_digital_activation_insert','beauty_digital_activation_update') AND app_role=ANY(roles::text[])) <> 3 THEN
  RAISE EXCEPTION 'Existing Beauty activation policies do not match the specified role';
 END IF;
END $$;
COMMIT;
