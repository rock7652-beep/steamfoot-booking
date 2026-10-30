-- REVIEW ONLY. This is not registered for automatic execution.
-- Requires the compatible prior application version, stopped writers, backup,
-- explicit production authorization, exact post-migration schema, and review.
-- Retains business records, notice tables, policies, grants and migration history.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
DECLARE actual text;
DECLARE trigger_count integer;
BEGIN
 SELECT md5(prosrc) INTO actual FROM pg_proc WHERE oid=to_regprocedure('public.record_steamfoot_store_notice()');
 IF actual IS DISTINCT FROM '4b6eae805afba6765db9328a7893c3b8' THEN RAISE EXCEPTION 'unexpected current booking function'; END IF;
 SELECT count(*) INTO trigger_count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
 WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgname,c.relname,p.proname,md5(pg_get_triggerdef(t.oid))) IN (
 ('course_incomplete_notice_resolution','CourseBooking','resolve_course_incomplete_notice','59c61b4cbe0d213403170ee262d10bc8'),
 ('course_session_incomplete_notice_resolution','CourseSession','resolve_course_session_incomplete_notices','f7f031ef140e76cc232bc102536c5651'),
 ('digital_manager_lead_notice','DigitalButlerLead','record_digital_manager_lead_notice','1a9763849993db75aa8e15507b02cc93'),
 ('digital_manager_vip_notice','SessionBalanceNotification','record_digital_manager_vip_notice','adec1f8658a7c14c7d777b2c713f9016'),
 ('steamfoot_incomplete_notice_resolution','Booking','resolve_steamfoot_incomplete_notice','98c77e7a8950bba2dbb19697cc8bfd0e'),
 ('steamfoot_plan_payment_notice','Transaction','record_steamfoot_plan_payment_notice','7d29c43af9769d73bd422010db0a4152'));
 IF trigger_count <> 6 THEN RAISE EXCEPTION 'unexpected notification trigger state'; END IF;
END $$;
DROP TRIGGER course_incomplete_notice_resolution ON public."CourseBooking";
DROP TRIGGER course_session_incomplete_notice_resolution ON public."CourseSession";
DROP TRIGGER digital_manager_lead_notice ON public."DigitalButlerLead";
DROP TRIGGER digital_manager_vip_notice ON public."SessionBalanceNotification";
DROP TRIGGER steamfoot_incomplete_notice_resolution ON public."Booking";
DROP TRIGGER steamfoot_plan_payment_notice ON public."Transaction";
CREATE OR REPLACE FUNCTION public.record_steamfoot_store_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $notice$
DECLARE
 event_kind text;
 booking_start timestamptz;
 previous_start timestamptz;
 customer_name text;
 service_name text;
 staff_name text;
 previous_staff_name text;
 actor jsonb;
 informational boolean;
BEGIN
 -- Also serializes setting changes with capture; never lock another store.
 PERFORM id FROM public."Store" WHERE id=NEW."storeId" AND "industryModule"='STEAMFOOT' FOR SHARE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF coalesce((SELECT enabled FROM public."SteamfootNoticeSetting" WHERE "storeId"=NEW."storeId"),true)=false THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  event_kind := 'BOOKING';
 ELSE
  IF ROW(NEW."bookingDate",NEW."slotTime",NEW.people,NEW."bookingStatus",NEW."serviceStaffId",NEW."servicePlanId",NEW.notes)
     IS NOT DISTINCT FROM ROW(OLD."bookingDate",OLD."slotTime",OLD.people,OLD."bookingStatus",OLD."serviceStaffId",OLD."servicePlanId",OLD.notes) THEN RETURN NEW; END IF;
  event_kind := CASE
   WHEN NEW."bookingStatus"='CANCELLED' AND OLD."bookingStatus"<>'CANCELLED' THEN 'CANCEL'
   WHEN NEW."bookingStatus"='NO_SHOW' AND OLD."bookingStatus"<>'NO_SHOW' THEN 'NO_SHOW'
   WHEN NEW."bookingStatus"='COMPLETED' AND OLD."bookingStatus"<>'COMPLETED' THEN 'COMPLETE'
   WHEN OLD."bookingStatus" IN ('CANCELLED','NO_SHOW','COMPLETED') AND NEW."bookingStatus" IN ('PENDING','CONFIRMED') THEN 'RESTORE'
   WHEN ROW(NEW."bookingDate",NEW."slotTime") IS DISTINCT FROM ROW(OLD."bookingDate",OLD."slotTime") THEN 'MOVE'
   ELSE 'UPDATE' END;
  IF event_kind='MOVE' THEN previous_start := (OLD."bookingDate"::date + OLD."slotTime"::time) AT TIME ZONE 'Asia/Taipei'; END IF;
  IF NEW."serviceStaffId" IS DISTINCT FROM OLD."serviceStaffId" THEN
   SELECT "displayName" INTO previous_staff_name FROM public."Staff" WHERE id=OLD."serviceStaffId" AND "storeId"=NEW."storeId";
   previous_staff_name := coalesce(previous_staff_name,'未指派');
  END IF;
 END IF;
 booking_start := (NEW."bookingDate"::date + NEW."slotTime"::time) AT TIME ZONE 'Asia/Taipei';
 SELECT name INTO customer_name FROM public."Customer" WHERE id=NEW."customerId" AND "storeId"=NEW."storeId";
 SELECT name INTO service_name FROM public."ServicePlan" WHERE id=NEW."servicePlanId" AND "storeId"=NEW."storeId";
 SELECT "displayName" INTO staff_name FROM public."Staff" WHERE id=NEW."serviceStaffId" AND "storeId"=NEW."storeId";
 actor := nullif(current_setting('steamfoot.audit_actor',true),'')::jsonb;
 informational := event_kind IN ('BOOKING','COMPLETE');
 INSERT INTO public."SteamfootStoreNotice" ("storeId","bookingId",kind,"customerName","serviceName","staffName","previousStaffName","startsAt","previousStartsAt","affectedCount",details,"handledAt","handledById","handledByName")
 VALUES (NEW."storeId",NEW.id,event_kind,coalesce(customer_name,'顧客'),coalesce(service_name,CASE NEW."bookingType"::text WHEN 'FIRST_TRIAL' THEN '體驗預約' WHEN 'SINGLE' THEN '單次預約' ELSE '方案預約' END),coalesce(staff_name,'未指派'),previous_staff_name,booking_start,previous_start,NEW.people,jsonb_build_object('bookingStatus',NEW."bookingStatus",'people',NEW.people),CASE WHEN informational THEN now() ELSE NULL END,CASE WHEN informational THEN coalesce(actor->>'id','system') ELSE NULL END,CASE WHEN informational THEN coalesce(actor->>'name','系統') ELSE NULL END)
 ON CONFLICT ("storeId","bookingId") DO UPDATE SET
  kind=EXCLUDED.kind,"customerName"=EXCLUDED."customerName","serviceName"=EXCLUDED."serviceName","staffName"=EXCLUDED."staffName",
  "previousStaffName"=CASE WHEN "SteamfootStoreNotice".kind='MOVE' AND EXCLUDED.kind='MOVE' THEN coalesce("SteamfootStoreNotice"."previousStaffName",EXCLUDED."previousStaffName") ELSE EXCLUDED."previousStaffName" END,
  "startsAt"=EXCLUDED."startsAt","previousStartsAt"=CASE WHEN "SteamfootStoreNotice".kind='MOVE' AND EXCLUDED.kind='MOVE' THEN coalesce("SteamfootStoreNotice"."previousStartsAt",EXCLUDED."previousStartsAt") ELSE EXCLUDED."previousStartsAt" END,
  "affectedCount"=EXCLUDED."affectedCount",details=EXCLUDED.details,"handledAt"=EXCLUDED."handledAt","handledById"=EXCLUDED."handledById","handledByName"=EXCLUDED."handledByName",revision="SteamfootStoreNotice".revision+1,"updatedAt"=now();
 RETURN NEW;
END;
$notice$;
COMMIT;
