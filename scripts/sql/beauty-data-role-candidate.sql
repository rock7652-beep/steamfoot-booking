-- REVIEW CANDIDATE ONLY. Run only after the separately reviewed Beauty schema exists.
-- NEW NOLOGIN runtime role; no password, DSN, existing-role changes or data writes.
-- Explicit same-session settings: beauty_data.role_name, expected_database,
-- review_id='beauty-data-v1'. Formal execution requires separate authorization.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog;
DO $$
DECLARE
 app_role text:=current_setting('beauty_data.role_name',true);
 tables text[]:=ARRAY['BeautySetting','BeautyService','BeautyTechnician','BeautyPlan','BeautyCard','BeautyGroup','BeautyAppointment','BeautyLedger','BeautyPayment','BeautySettlement','BeautyCommand','BeautyEvent','BeautyPurchase'];
 mutable text[]:=ARRAY['BeautySetting','BeautyService','BeautyTechnician','BeautyPlan','BeautyCard','BeautyGroup','BeautyAppointment','BeautyEvent','BeautyPurchase'];
 shared_read text[]:=ARRAY['Store','Customer','CourseRoom','BusinessHours','SpecialBusinessDay','SlotOverride','TrialBookingLink','CashDrawerSession','CourseRental'];
 t text; relation regclass;
BEGIN
 IF current_setting('beauty_data.review_id',true) IS DISTINCT FROM 'beauty-data-v1'
 OR current_setting('beauty_data.expected_database',true) IS DISTINCT FROM current_database() THEN
  RAISE EXCEPTION 'Explicit reviewed database and Beauty data change marker required';
 END IF;
 IF app_role IS NULL OR app_role !~ '^steamfoot_beauty_data_[a-z][a-z0-9_]{0,34}$'
 OR EXISTS(SELECT FROM pg_roles WHERE rolname=app_role) THEN
  RAISE EXCEPTION 'Choose a NEW dedicated steamfoot_beauty_data_* role';
 END IF;
 IF EXISTS(SELECT FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'beauty_data_v1_%') THEN
  RAISE EXCEPTION 'Beauty data v1 policies already exist; do not rerun';
 END IF;
 FOREACH t IN ARRAY tables||shared_read||ARRAY['CashbookEntry'] LOOP
  relation:=to_regclass(format('public.%I',t));
  IF relation IS NULL OR NOT EXISTS(SELECT FROM pg_class WHERE oid=relation AND relkind IN ('r','p') AND relrowsecurity) THEN
   RAISE EXCEPTION 'Required RLS-enabled dependency missing: %',t;
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT FROM pg_trigger WHERE tgrelid='public."CourseRoom"'::regclass AND tgname='course_space_disable' AND NOT tgisinternal AND tgenabled IN ('O','A'))
 OR NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.course_space_disable_guard()') AND NOT prosecdef) THEN
  RAISE EXCEPTION 'Expected active INVOKER space guard missing';
 END IF;
 EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',app_role);
 IF has_schema_privilege(app_role,'public','CREATE') OR EXISTS(
  SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p') AND has_table_privilege(app_role,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 ) THEN RAISE EXCEPTION 'Unexpected PUBLIC privileges; review separately'; END IF;
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I',current_database(),app_role);
 EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',app_role);
 FOREACH t IN ARRAY tables||shared_read LOOP
  EXECUTE format('GRANT SELECT ON public.%I TO %I',t,app_role);
  EXECUTE format('CREATE POLICY beauty_data_v1_read ON public.%I FOR SELECT TO %I USING(true)',t,app_role);
 END LOOP;
 FOREACH t IN ARRAY tables LOOP
  EXECUTE format('GRANT INSERT ON public.%I TO %I',t,app_role);
  EXECUTE format('CREATE POLICY beauty_data_v1_insert ON public.%I FOR INSERT TO %I WITH CHECK(true)',t,app_role);
 END LOOP;
 FOREACH t IN ARRAY mutable LOOP
  EXECUTE format('GRANT UPDATE ON public.%I TO %I',t,app_role);
  EXECUTE format('CREATE POLICY beauty_data_v1_update ON public.%I FOR UPDATE TO %I USING(true) WITH CHECK(true)',t,app_role);
 END LOOP;
 -- Shared writes are restricted to the exact columns used by Beauty actions.
 EXECUTE format('GRANT UPDATE(id) ON public."Store" TO %I',app_role);
 EXECUTE format('GRANT INSERT(id,"storeId",name,phone,notes,"authSource","customerStage","selfBookingEnabled","lineUserId","lineLinkStatus","lineLinkedAt","createdAt","updatedAt"), UPDATE(name,phone,notes,"updatedAt") ON public."Customer" TO %I',app_role);
 EXECUTE format('GRANT INSERT(id,"storeId",name,capacity,details,category,"isActive","createdAt",equipment,location,"rentalEnabled","rentalHourlyRate","rentalBufferMinutes"), UPDATE(name,"isActive") ON public."CourseRoom" TO %I',app_role);
 EXECUTE format('GRANT UPDATE("consumedAt") ON public."TrialBookingLink" TO %I',app_role);
 EXECUTE format('GRANT UPDATE("updatedAt") ON public."CashDrawerSession" TO %I',app_role);
 EXECUTE format('GRANT INSERT(id,"storeId","entryDate",type,"paymentMethod",category,amount,note,"createdByUserId","updatedAt") ON public."CashbookEntry" TO %I',app_role);
 FOREACH t IN ARRAY ARRAY['Store','Customer','CourseRoom','TrialBookingLink','CashDrawerSession'] LOOP
  EXECUTE format('CREATE POLICY beauty_data_v1_shared_update ON public.%I FOR UPDATE TO %I USING(true) WITH CHECK(true)',t,app_role);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['Customer','CourseRoom','CashbookEntry'] LOOP
  EXECUTE format('CREATE POLICY beauty_data_v1_shared_insert ON public.%I FOR INSERT TO %I WITH CHECK(true)',t,app_role);
 END LOOP;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname=app_role AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolinherit))
 OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=app_role)
 OR EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND has_table_privilege(app_role,c.oid,'DELETE,TRUNCATE,TRIGGER,REFERENCES')) THEN
  RAISE EXCEPTION 'Postflight privilege boundary failed';
 END IF;
END $$;
COMMIT;
