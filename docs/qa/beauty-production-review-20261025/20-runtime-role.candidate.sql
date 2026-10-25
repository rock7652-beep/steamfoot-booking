-- REVIEWED CANDIDATE ONLY. Explicit formal execution authorization is still required.
-- Never an automatic migration. Run with ON_ERROR_STOP and an externally pinned project/connection.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog;
DO $$ BEGIN
 IF current_setting('beauty_release.review_id',true) IS DISTINCT FROM 'beauty-production-20261025-v1'
 OR current_setting('beauty_release.expected_database',true) IS DISTINCT FROM current_database() THEN
  RAISE EXCEPTION 'Explicit reviewed release marker and expected database required';
 END IF;
END $$;
DO $$
DECLARE app_role text:=current_setting('beauty_release.runtime_role',true); t text; p record;
BEGIN
 IF app_role IS NULL OR app_role !~ '^steamfoot_beauty_[a-z][a-z0-9_]{0,39}$'
 OR EXISTS(SELECT FROM pg_roles WHERE rolname=app_role) THEN RAISE EXCEPTION 'Explicit NEW dedicated Beauty LOGIN role required'; END IF;
 IF EXISTS(SELECT FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'beauty_release_v1_%')
 OR to_regprocedure('public.beauty_release_lock_only_guard()') IS NOT NULL THEN RAISE EXCEPTION 'Release role/policies already installed; stop'; END IF;
 FOREACH t IN ARRAY ARRAY['BeautySetting','BeautyService','BeautyTechnician','BeautyPlan','BeautyCard','BeautyGroup','BeautyAppointment','BeautyLedger','BeautyPayment','BeautySettlement','BeautyCommand','BeautyEvent','BeautyPurchase','BeautyTransactionRevision','Store','Customer','Staff','User','CourseRoom','BusinessHours','SpecialBusinessDay','SlotOverride','CourseRental','CourseDisplayOrder','CashDrawerSession','CashbookEntry','TrialBookingLink','CourseStoreNotice'] LOOP
  IF NOT EXISTS(SELECT FROM pg_class WHERE oid=to_regclass(format('public.%I',t)) AND relkind IN ('r','p') AND relrowsecurity) THEN
   RAISE EXCEPTION 'Required RLS-enabled relation missing: %',t;
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT FROM pg_trigger WHERE tgrelid='public."CourseRoom"'::regclass AND tgname='course_space_disable' AND NOT tgisinternal AND tgenabled IN ('O','A'))
 OR NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.course_space_disable_guard()') AND NOT prosecdef) THEN RAISE EXCEPTION 'Expected shared INVOKER room guard missing'; END IF;
 IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public."CourseStoreNotice"'::regclass AND conname='CourseStoreNotice_kind_check') IS DISTINCT FROM $expected$CHECK ((kind = ANY (ARRAY['BOOKING'::text, 'LEAVE'::text, 'CANCEL'::text, 'MOVE'::text, 'STOP'::text, 'RESTORE'::text])))$expected$ THEN RAISE EXCEPTION 'Shared notice constraint drift; stop before changing it'; END IF;
 EXECUTE format('CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',app_role);
 -- No password is installed. Provision the new secret separately through a reviewed secure channel.
 IF has_schema_privilege(app_role,'public','CREATE') OR EXISTS(
  SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')
  AND (has_table_privilege(app_role,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(app_role,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))
 ) THEN RAISE EXCEPTION 'Unexpected PUBLIC privileges inherited by new role'; END IF;
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I',current_database(),app_role);
 EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',app_role);
 EXECUTE format('GRANT SELECT ON public."BeautySetting" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."BeautySetting" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT INSERT ON public."BeautySetting" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."BeautySetting" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT UPDATE ON public."BeautySetting" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_update ON public."BeautySetting" FOR UPDATE TO %I USING(true) WITH CHECK(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."BeautyService" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."BeautyService" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT INSERT ON public."BeautyService" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."BeautyService" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT UPDATE ON public."BeautyService" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_update ON public."BeautyService" FOR UPDATE TO %I USING(true) WITH CHECK(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."BeautyTechnician" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."BeautyTechnician" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT INSERT ON public."BeautyTechnician" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."BeautyTechnician" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT UPDATE ON public."BeautyTechnician" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_update ON public."BeautyTechnician" FOR UPDATE TO %I USING(true) WITH CHECK(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."BeautyPlan" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."BeautyPlan" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT INSERT ON public."BeautyPlan" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."BeautyPlan" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT UPDATE ON public."BeautyPlan" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_update ON public."BeautyPlan" FOR UPDATE TO %I USING(true) WITH CHECK(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."BeautyCard" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."BeautyCard" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT INSERT ON public."BeautyCard" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."BeautyCard" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT UPDATE ON public."BeautyCard" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_update ON public."BeautyCard" FOR UPDATE TO %I USING(true) WITH CHECK(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."BeautyGroup" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."BeautyGroup" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT INSERT ON public."BeautyGroup" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."BeautyGroup" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT UPDATE ON public."BeautyGroup" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_update ON public."BeautyGroup" FOR UPDATE TO %I USING(true) WITH CHECK(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."BeautyAppointment" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."BeautyAppointment" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT INSERT ON public."BeautyAppointment" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."BeautyAppointment" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT UPDATE ON public."BeautyAppointment" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_update ON public."BeautyAppointment" FOR UPDATE TO %I USING(true) WITH CHECK(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."BeautyLedger" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."BeautyLedger" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT INSERT ON public."BeautyLedger" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."BeautyLedger" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."BeautyPayment" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."BeautyPayment" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT INSERT ON public."BeautyPayment" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."BeautyPayment" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."BeautySettlement" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."BeautySettlement" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT INSERT ON public."BeautySettlement" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."BeautySettlement" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."BeautyCommand" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."BeautyCommand" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT INSERT ON public."BeautyCommand" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."BeautyCommand" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."BeautyEvent" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."BeautyEvent" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT INSERT ON public."BeautyEvent" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."BeautyEvent" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT UPDATE ON public."BeautyEvent" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_update ON public."BeautyEvent" FOR UPDATE TO %I USING(true) WITH CHECK(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."BeautyPurchase" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."BeautyPurchase" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT INSERT ON public."BeautyPurchase" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."BeautyPurchase" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT UPDATE ON public."BeautyPurchase" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_update ON public."BeautyPurchase" FOR UPDATE TO %I USING(true) WITH CHECK(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."BeautyTransactionRevision" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."BeautyTransactionRevision" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT INSERT ON public."BeautyTransactionRevision" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."BeautyTransactionRevision" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT SELECT("id","industryModule","operatingStatus") ON public."Store" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."Store" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT SELECT("id","storeId","userId","name","phone","notes","email","gender","birthday","address","emergencyContactName","emergencyContactPhone","assignedStaffId","mergedIntoCustomerId","createdAt","updatedAt") ON public."Customer" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."Customer" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT SELECT("id","storeId","userId","displayName","status") ON public."Staff" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."Staff" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT SELECT("id","status") ON public."User" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."User" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."CourseRoom" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."CourseRoom" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."BusinessHours" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."BusinessHours" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."SpecialBusinessDay" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."SpecialBusinessDay" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."SlotOverride" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."SlotOverride" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."CourseRental" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."CourseRental" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."CourseDisplayOrder" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."CourseDisplayOrder" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."CashDrawerSession" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."CashDrawerSession" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."CashbookEntry" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."CashbookEntry" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT SELECT("id","storeId","expiresAt","consumedAt") ON public."TrialBookingLink" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."TrialBookingLink" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT SELECT ON public."CourseStoreNotice" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_select ON public."CourseStoreNotice" FOR SELECT TO %I USING(true)',app_role);
 EXECUTE format('GRANT INSERT("id","storeId","name","phone","notes","authSource","customerStage","selfBookingEnabled","lineUserId","lineLinkStatus","lineLinkedAt","createdAt","updatedAt") ON public."Customer" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."Customer" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT INSERT("id","storeId","name","capacity","details","category","isActive","createdAt","equipment","location","rentalEnabled","rentalHourlyRate","rentalBufferMinutes") ON public."CourseRoom" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."CourseRoom" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT INSERT("id","storeId","entryDate","type","paymentMethod","category","amount","note","createdByUserId","updatedAt") ON public."CashbookEntry" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."CashbookEntry" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT INSERT ON public."CourseStoreNotice" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."CourseStoreNotice" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT INSERT("storeId","kind","ids","revision") ON public."CourseDisplayOrder" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_insert ON public."CourseDisplayOrder" FOR INSERT TO %I WITH CHECK(true)',app_role);
 EXECUTE format('GRANT UPDATE("id") ON public."Store" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_update ON public."Store" FOR UPDATE TO %I USING(true) WITH CHECK(true)',app_role);
 EXECUTE format('GRANT UPDATE("id") ON public."CashbookEntry" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_update ON public."CashbookEntry" FOR UPDATE TO %I USING(true) WITH CHECK(true)',app_role);
 EXECUTE format('GRANT UPDATE("name","phone","notes","email","gender","birthday","address","emergencyContactName","emergencyContactPhone","updatedAt") ON public."Customer" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_update ON public."Customer" FOR UPDATE TO %I USING(true) WITH CHECK(true)',app_role);
 EXECUTE format('GRANT UPDATE("name","isActive","capacity","rentalEnabled","rentalHourlyRate","rentalBufferMinutes","details","category","equipment","location") ON public."CourseRoom" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_update ON public."CourseRoom" FOR UPDATE TO %I USING(true) WITH CHECK(true)',app_role);
 EXECUTE format('GRANT UPDATE("consumedAt") ON public."TrialBookingLink" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_update ON public."TrialBookingLink" FOR UPDATE TO %I USING(true) WITH CHECK(true)',app_role);
 EXECUTE format('GRANT UPDATE("updatedAt") ON public."CashDrawerSession" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_update ON public."CashDrawerSession" FOR UPDATE TO %I USING(true) WITH CHECK(true)',app_role);
 EXECUTE format('GRANT UPDATE ON public."CourseStoreNotice" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_update ON public."CourseStoreNotice" FOR UPDATE TO %I USING(true) WITH CHECK(true)',app_role);
 EXECUTE format('GRANT UPDATE("ids","revision") ON public."CourseDisplayOrder" TO %I',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_update ON public."CourseDisplayOrder" FOR UPDATE TO %I USING(true) WITH CHECK(true)',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."BeautySetting" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautySetting"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautySetting"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."BeautyService" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyService"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyService"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."BeautyTechnician" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyTechnician"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyTechnician"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."BeautyPlan" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyPlan"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyPlan"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."BeautyCard" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyCard"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyCard"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."BeautyGroup" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyGroup"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyGroup"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."BeautyAppointment" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyAppointment"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyAppointment"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."BeautyLedger" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyLedger"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyLedger"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."BeautyPayment" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyPayment"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyPayment"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."BeautySettlement" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautySettlement"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautySettlement"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."BeautyCommand" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyCommand"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyCommand"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."BeautyEvent" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyEvent"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyEvent"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."BeautyPurchase" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyPurchase"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyPurchase"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."BeautyTransactionRevision" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyTransactionRevision"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BeautyTransactionRevision"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."Store" AS RESTRICTIVE FOR ALL TO %I USING("industryModule"::text=''BEAUTY'') WITH CHECK("industryModule"::text=''BEAUTY'')',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."Customer" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="Customer"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="Customer"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."Staff" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="Staff"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="Staff"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."User" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Staff" s WHERE s."userId"="User".id) OR EXISTS(SELECT 1 FROM public."Customer" c WHERE c."userId"="User".id)) WITH CHECK(EXISTS(SELECT 1 FROM public."Staff" s WHERE s."userId"="User".id) OR EXISTS(SELECT 1 FROM public."Customer" c WHERE c."userId"="User".id))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."CourseRoom" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="CourseRoom"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="CourseRoom"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."BusinessHours" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BusinessHours"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="BusinessHours"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."SpecialBusinessDay" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="SpecialBusinessDay"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="SpecialBusinessDay"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."SlotOverride" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="SlotOverride"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="SlotOverride"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."CourseRental" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="CourseRental"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="CourseRental"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."CourseDisplayOrder" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="CourseDisplayOrder"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="CourseDisplayOrder"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."CashDrawerSession" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="CashDrawerSession"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="CashDrawerSession"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."CashbookEntry" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="CashbookEntry"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="CashbookEntry"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."TrialBookingLink" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="TrialBookingLink"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="TrialBookingLink"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
 EXECUTE format('CREATE POLICY beauty_release_v1_scope ON public."CourseStoreNotice" AS RESTRICTIVE FOR ALL TO %I USING(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="CourseStoreNotice"."storeId" AND bs."industryModule"::text=''BEAUTY'')) WITH CHECK(EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="CourseStoreNotice"."storeId" AND bs."industryModule"::text=''BEAUTY''))',app_role);
END $$;
-- Preserve all six shared course kinds; new outcomes require Beauty namespaced subjects.
ALTER TABLE public."CourseStoreNotice" DROP CONSTRAINT "CourseStoreNotice_kind_check";
ALTER TABLE public."CourseStoreNotice" ADD CONSTRAINT "CourseStoreNotice_kind_check"
 CHECK(kind IN ('BOOKING','LEAVE','CANCEL','MOVE','STOP','RESTORE') OR ("subjectKey" LIKE 'beauty:%' AND kind IN ('COMPLETE','NO_SHOW')));
-- Column UPDATE(id) exists solely to permit SELECT FOR UPDATE. Actual updates are prohibited for this role.
CREATE FUNCTION public.beauty_release_lock_only_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF current_user=TG_ARGV[0] THEN RAISE EXCEPTION 'Beauty runtime may lock but not mutate this shared relation'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.beauty_release_lock_only_guard() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE app_role text:=current_setting('beauty_release.runtime_role',true); t text; BEGIN
 FOREACH t IN ARRAY ARRAY['Store','CashbookEntry'] LOOP
  EXECUTE format('CREATE TRIGGER beauty_release_lock_only BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.beauty_release_lock_only_guard(%L)',t,app_role);
 END LOOP;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname=app_role AND (NOT rolcanlogin OR rolinherit OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
 OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=app_role)
 OR EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND has_table_privilege(app_role,c.oid,'DELETE,TRUNCATE,TRIGGER,REFERENCES'))
 OR has_column_privilege(app_role,'public."User"','passwordHash','SELECT') THEN RAISE EXCEPTION 'Runtime privilege postflight failed'; END IF;
END $$;
COMMIT;
